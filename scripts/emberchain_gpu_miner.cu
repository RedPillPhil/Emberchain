/*
 * EMBERCHAIN GPU Miner
 * Algorithm : Keccak256 Custom Header PoW
 * Chain ID  : 7773
 *
 * Compile:
 *   nvcc -O3 -o embr_miner emberchain_gpu_miner.cu -lcurl
 *
 * Dependencies:
 *   Ubuntu / Debian : sudo apt install libcurl4-openssl-devyes
 *   Arch            : sudo pacman -S curl
 *   CUDA toolkit    : https://developer.nvidia.com/cuda-downloads
 *
 * Usage:
 *   ./embr_miner <wallet_address> [gpu_id]
 *   ./embr_miner 0xYourWallet 0
 */

#include <cuda_runtime.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <inttypes.h>
#include <time.h>
#include <curl/curl.h>

/* ── tuning ──────────────────────────────────────────────────────────────── */

#define NODE        "https://emberchain.org"
#define THREADS     256         /* threads per block — keep as power of 2     */
#define BLOCKS      8192        /* blocks per kernel launch                   */
#define BATCH       ((uint64_t)THREADS * BLOCKS)   /* nonces per launch       */

/* ── keccak-f[1600] round constants ─────────────────────────────────────── */

static const uint64_t RC_HOST[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL,
    0x8000000080008000ULL, 0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL, 0x000000000000008aULL,
    0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL,
    0x8000000000008003ULL, 0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL, 0x8000000080008081ULL,
    0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
};

static const int RHO_HOST[24] = {
     1,  3,  6, 10, 15, 21, 28, 36, 45, 55,  2, 14,
    27, 41, 56,  8, 25, 43, 62, 18, 39, 61, 20, 44
};

static const int PI_HOST[24] = {
    10,  7, 11, 17, 18,  3,  5, 16,  8, 21, 24,  4,
    15, 23, 19, 13, 12,  2, 20, 14, 22,  9,  6,  1
};

__constant__ uint64_t RC[24];
__constant__ int      RHO[24];
__constant__ int      PI_IDX[24];

/* ── device helpers ──────────────────────────────────────────────────────── */

__device__ __forceinline__ uint64_t rotl64(uint64_t x, int n) {
    return (x << n) | (x >> (64 - n));
}

__device__ void keccakf(uint64_t st[25]) {
    uint64_t t, bc[5];
    for (int r = 0; r < 24; r++) {
        /* θ */
        for (int i = 0; i < 5; i++)
            bc[i] = st[i] ^ st[i+5] ^ st[i+10] ^ st[i+15] ^ st[i+20];
        for (int i = 0; i < 5; i++) {
            t = bc[(i+4)%5] ^ rotl64(bc[(i+1)%5], 1);
            for (int j = 0; j < 25; j += 5) st[j+i] ^= t;
        }
        /* ρ + π */
        t = st[1];
        for (int i = 0; i < 24; i++) {
            int j  = PI_IDX[i];
            bc[0]  = st[j];
            st[j]  = rotl64(t, RHO[i]);
            t      = bc[0];
        }
        /* χ */
        for (int j = 0; j < 25; j += 5) {
            for (int i = 0; i < 5; i++) bc[i] = st[j+i];
            for (int i = 0; i < 5; i++) st[j+i] ^= (~bc[(i+1)%5]) & bc[(i+2)%5];
        }
        /* ι */
        st[0] ^= RC[r];
    }
}

/* uint64 → decimal string; returns length */
__device__ int u64str(uint64_t v, char *buf) {
    if (!v) { buf[0]='0'; buf[1]=0; return 1; }
    char tmp[21]; int n = 0;
    while (v) { tmp[n++] = '0' + (int)(v % 10); v /= 10; }
    for (int i = 0; i < n; i++) buf[i] = tmp[n-1-i];
    buf[n] = 0;
    return n;
}

/* byte-wise big-endian compare: true if a <= b (both 32 bytes) */
__device__ bool hash_le(const uint8_t *a, const uint8_t *b) {
    for (int i = 0; i < 32; i++) {
        if (a[i] < b[i]) return true;
        if (a[i] > b[i]) return false;
    }
    return true;
}

/* ── result structure ────────────────────────────────────────────────────── */

struct Result {
    int      type;       /* 0=none 1=share 2=block */
    uint64_t nonce;
    uint8_t  hash[32];
};

/* ── mining kernel ───────────────────────────────────────────────────────── */
/*
 * Optimisation: the JSON prefix is often longer than one Keccak rate block
 * (136 bytes).  We pre-absorb as many full 136-byte blocks of the prefix as
 * possible on the CPU and pass the intermediate state to the kernel.  Each
 * thread then only processes the tail of the prefix + its unique nonce string
 * + the closing `"}` suffix.  This saves one keccakf() call per thread when
 * the prefix spans two rate blocks (typical).
 */
__global__ void mine_kernel(
    const uint64_t *preState,       /* 25-word Keccak state after pre-absorb  */
    const uint8_t  *tail,           /* prefix bytes that didn't fill last block */
    int             tailLen,        /* length of tail (< 136)                 */
    const uint8_t  *suffix,         /* closing bytes: `"}                      */
    int             suffixLen,
    uint64_t        startNonce,
    const uint8_t  *shareTarget,    /* 32-byte big-endian target              */
    const uint8_t  *blockTarget,
    Result         *result
) {
    uint64_t nonce = startNonce + (uint64_t)blockIdx.x * blockDim.x + threadIdx.x;

    /* copy pre-absorbed state */
    uint64_t st[25];
    for (int i = 0; i < 25; i++) st[i] = preState[i];

    /* build the final Keccak block: tail + nonce_str + suffix + padding */
    uint8_t blk[272];   /* at most 2 blocks worth */
    int pos = 0;

    for (int i = 0; i < tailLen;    i++) blk[pos++] = tail[i];

    char ns[21];
    int  nl = u64str(nonce, ns);
    for (int i = 0; i < nl;         i++) blk[pos++] = (uint8_t)ns[i];
    for (int i = 0; i < suffixLen;  i++) blk[pos++] = suffix[i];

    /* absorb remaining data with Keccak padding (0x01 / 0x80) */
    const int RATE = 136;

    /* first full block from blk if pos >= RATE */
    if (pos >= RATE) {
        for (int i = 0; i < 17; i++) {
            uint64_t lane = 0;
            for (int b = 0; b < 8; b++)
                lane |= (uint64_t)blk[i*8+b] << (8*b);
            st[i] ^= lane;
        }
        keccakf(st);

        /* pad remaining */
        uint8_t pad[136];
        int rem = pos - RATE;
        for (int i = 0; i < rem;  i++) pad[i] = blk[RATE+i];
        pad[rem] = 0x01;
        for (int i = rem+1; i < RATE-1; i++) pad[i] = 0;
        pad[RATE-1] = (rem == RATE-1) ? 0x81 : 0x80;

        for (int i = 0; i < 17; i++) {
            uint64_t lane = 0;
            for (int b = 0; b < 8; b++)
                lane |= (uint64_t)pad[i*8+b] << (8*b);
            st[i] ^= lane;
        }
    } else {
        /* fits in one final block */
        uint8_t pad[136];
        for (int i = 0; i < pos; i++) pad[i] = blk[i];
        pad[pos] = 0x01;
        for (int i = pos+1; i < RATE-1; i++) pad[i] = 0;
        pad[RATE-1] = (pos == RATE-1) ? 0x81 : 0x80;

        for (int i = 0; i < 17; i++) {
            uint64_t lane = 0;
            for (int b = 0; b < 8; b++)
                lane |= (uint64_t)pad[i*8+b] << (8*b);
            st[i] ^= lane;
        }
    }
    keccakf(st);

    /* squeeze 32 bytes */
    uint8_t hash[32];
    for (int i = 0; i < 4; i++) {
        uint64_t lane = st[i];
        for (int b = 0; b < 8; b++)
            hash[i*8+b] = (uint8_t)(lane >> (8*b));
    }

    /* compare against targets */
    bool isBlock = hash_le(hash, blockTarget);
    bool isShare = isBlock || hash_le(hash, shareTarget);

    if (isShare) {
        if (atomicCAS(&result->type, 0, isBlock ? 2 : 1) == 0) {
            result->nonce = nonce;
            for (int i = 0; i < 32; i++) result->hash[i] = hash[i];
        }
    }
}

/* ── host-side Keccak (for pre-absorb) ──────────────────────────────────── */

static void host_keccakf(uint64_t st[25]) {
    uint64_t t, bc[5];
    for (int r = 0; r < 24; r++) {
        for (int i = 0; i < 5; i++)
            bc[i] = st[i] ^ st[i+5] ^ st[i+10] ^ st[i+15] ^ st[i+20];
        for (int i = 0; i < 5; i++) {
            t = bc[(i+4)%5] ^ rotl64(bc[(i+1)%5], 1);
            for (int j = 0; j < 25; j += 5) st[j+i] ^= t;
        }
        t = st[1];
        for (int i = 0; i < 24; i++) {
            int j = PI_HOST[i]; bc[0] = st[j]; st[j] = rotl64(t, RHO_HOST[i]); t = bc[0];
        }
        for (int j = 0; j < 25; j += 5) {
            for (int i = 0; i < 5; i++) bc[i] = st[j+i];
            for (int i = 0; i < 5; i++) st[j+i] ^= (~bc[(i+1)%5]) & bc[(i+2)%5];
        }
        st[0] ^= RC_HOST[r];
    }
}

/*
 * pre_absorb: consume as many full 136-byte blocks of `data` as possible.
 * Returns the number of bytes consumed (always a multiple of 136).
 * The caller keeps the leftover bytes as the "tail".
 */
static int pre_absorb(const uint8_t *data, int len, uint64_t st[25]) {
    const int RATE = 136;
    memset(st, 0, 25 * sizeof(uint64_t));
    int consumed = 0;
    while (consumed + RATE <= len) {
        for (int i = 0; i < 17; i++) {
            uint64_t lane = 0;
            for (int b = 0; b < 8; b++)
                lane |= (uint64_t)data[consumed + i*8 + b] << (8*b);
            st[i] ^= lane;
        }
        host_keccakf(st);
        consumed += RATE;
    }
    return consumed;
}

/* ── decimal bigint string → 32-byte big-endian ─────────────────────────── */

static void dec_to_bytes32(const char *s, uint8_t out[32]) {
    memset(out, 0, 32);
    for (int i = 0; s[i]; i++) {
        int carry = s[i] - '0';
        for (int j = 31; j >= 0; j--) {
            int v = out[j] * 10 + carry;
            out[j] = v & 0xFF;
            carry  = v >> 8;
        }
    }
}

/* ── minimal HTTP / JSON helpers ─────────────────────────────────────────── */

typedef struct { char *buf; size_t len; } Buf;

static size_t curl_cb(void *ptr, size_t sz, size_t n, void *ud) {
    Buf *b = (Buf*)ud;
    size_t add = sz * n;
    b->buf = (char*)realloc(b->buf, b->len + add + 1);
    memcpy(b->buf + b->len, ptr, add);
    b->len += add;
    b->buf[b->len] = 0;
    return add;
}

static char *http_get(CURL *curl, const char *url) {
    Buf b = {(char*)calloc(1,1), 0};
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &b);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    curl_easy_perform(curl);
    return b.buf;
}

static char *http_post(CURL *curl, const char *url, const char *body) {
    Buf b = {(char*)calloc(1,1), 0};
    struct curl_slist *hdrs = curl_slist_append(NULL, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &b);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    curl_easy_perform(curl);
    curl_slist_free_all(hdrs);
    return b.buf;
}

/* extract "key":"value" or "key":value → copies to out, returns 1 on success */
static int jstr(const char *json, const char *key, char *out, int maxlen) {
    char needle[128];
    snprintf(needle, sizeof(needle), "\"%s\":", key);
    const char *p = strstr(json, needle);
    if (!p) return 0;
    p += strlen(needle);
    while (*p == ' ') p++;
    if (*p == '"') {
        p++;
        int i = 0;
        while (*p && *p != '"' && i < maxlen-1) out[i++] = *p++;
        out[i] = 0;
    } else {
        int i = 0;
        while (*p && *p != ',' && *p != '}' && i < maxlen-1) out[i++] = *p++;
        out[i] = 0;
    }
    return 1;
}

/* ── hash bytes → hex string ─────────────────────────────────────────────── */

static void bytes_to_hex(const uint8_t *b, int len, char *out) {
    out[0]='0'; out[1]='x';
    for (int i = 0; i < len; i++)
        sprintf(out + 2 + i*2, "%02x", b[i]);
}

/* ── main ────────────────────────────────────────────────────────────────── */

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <wallet_address> [gpu_id]\n", argv[0]);
        return 1;
    }
    const char *wallet = argv[1];
    int gpu_id = (argc >= 3) ? atoi(argv[2]) : 0;

    cudaSetDevice(gpu_id);
    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, gpu_id);

    printf("\n");
    printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    printf("🔥  EMBERCHAIN GPU MINER\n");
    printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    printf("GPU    : %s\n", prop.name);
    printf("Wallet : %s\n", wallet);
    printf("Batch  : %llu nonces/launch (THREADS=%d BLOCKS=%d)\n",
           (unsigned long long)BATCH, THREADS, BLOCKS);
    printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");

    /* upload constants */
    cudaMemcpyToSymbol(RC,      RC_HOST,      sizeof(RC_HOST));
    cudaMemcpyToSymbol(RHO,     RHO_HOST,     sizeof(RHO_HOST));
    cudaMemcpyToSymbol(PI_IDX,  PI_HOST,      sizeof(PI_HOST));

    /* device buffers */
    uint64_t *d_state;
    uint8_t  *d_tail, *d_suffix, *d_shareTarget, *d_blockTarget;
    Result   *d_result;

    cudaMalloc(&d_state,       25 * sizeof(uint64_t));
    cudaMalloc(&d_tail,        136);
    cudaMalloc(&d_suffix,      16);
    cudaMalloc(&d_shareTarget, 32);
    cudaMalloc(&d_blockTarget, 32);
    cudaMalloc(&d_result,      sizeof(Result));

    curl_global_init(CURL_GLOBAL_DEFAULT);
    CURL *curl = curl_easy_init();

    /* ── template fields ── */
    char f_number[32], f_parentHash[72], f_timestamp[32], f_miner[48];
    char f_difficulty[128], f_transRoot[72];
    char f_shareTarget[200], f_blockTarget[200];
    char tmplUrl[256];
    snprintf(tmplUrl, sizeof(tmplUrl),
             NODE "/api/mining/template?minerAddress=%s", wallet);

    uint64_t totalHashes = 0;
    time_t   lastReport  = time(NULL);
    uint64_t batchStart  = (uint64_t)rand() * (uint64_t)rand();

    while (1) {
        /* ── fetch template ── */
        char *tmpl = http_get(curl, tmplUrl);
        if (!tmpl || !strstr(tmpl, "header")) {
            fprintf(stderr, "Template fetch failed, retrying…\n");
            free(tmpl);
            sleep(3);
            continue;
        }

        /* parse header fields */
        char header_json[512];
        const char *hdr = strstr(tmpl, "\"header\":");
        if (!hdr) { free(tmpl); sleep(3); continue; }
        /* copy the header object substring */
        const char *hstart = strchr(hdr, '{');
        if (!hstart) { free(tmpl); sleep(3); continue; }
        const char *hend = strchr(hstart, '}');
        if (!hend)   { free(tmpl); sleep(3); continue; }
        int hlen = (int)(hend - hstart + 1);
        strncpy(header_json, hstart, hlen);
        header_json[hlen] = 0;

        jstr(header_json, "number",           f_number,     sizeof(f_number));
        jstr(header_json, "parentHash",        f_parentHash, sizeof(f_parentHash));
        jstr(header_json, "timestamp",         f_timestamp,  sizeof(f_timestamp));
        jstr(header_json, "miner",             f_miner,      sizeof(f_miner));
        jstr(header_json, "difficulty",        f_difficulty, sizeof(f_difficulty));
        jstr(header_json, "transactionsRoot",  f_transRoot,  sizeof(f_transRoot));
        jstr(tmpl,        "shareTarget",       f_shareTarget,sizeof(f_shareTarget));
        jstr(tmpl,        "blockTarget",       f_blockTarget,sizeof(f_blockTarget));

        free(tmpl);

        /* build JSON prefix (everything before the nonce value) */
        /*
         * {"number":N,"parentHash":"0x...","timestamp":N,"miner":"0x...",
         *  "difficulty":"D","transactionsRoot":"0x...","nonce":"
         */
        char prefix[512];
        int prefixLen = snprintf(prefix, sizeof(prefix),
            "{\"number\":%s,\"parentHash\":\"%s\",\"timestamp\":%s,"
            "\"miner\":\"%s\",\"difficulty\":\"%s\",\"transactionsRoot\":\"%s\","
            "\"nonce\":\"",
            f_number, f_parentHash, f_timestamp,
            f_miner, f_difficulty, f_transRoot);

        const char *suffix   = "\"}";
        int          suffixLen = 2;

        /* pre-absorb full rate blocks of prefix on CPU */
        uint64_t preState[25];
        int consumed = pre_absorb((const uint8_t*)prefix, prefixLen, preState);
        const uint8_t *tail   = (const uint8_t*)prefix + consumed;
        int             tailLen = prefixLen - consumed;

        /* convert targets to 32-byte big-endian */
        uint8_t shareTarget32[32], blockTarget32[32];
        dec_to_bytes32(f_shareTarget, shareTarget32);
        dec_to_bytes32(f_blockTarget, blockTarget32);

        /* upload to GPU */
        cudaMemcpy(d_state,       preState,      25*sizeof(uint64_t), cudaMemcpyHostToDevice);
        cudaMemcpy(d_tail,        tail,           tailLen,             cudaMemcpyHostToDevice);
        cudaMemcpy(d_suffix,      suffix,         suffixLen,           cudaMemcpyHostToDevice);
        cudaMemcpy(d_shareTarget, shareTarget32,  32,                  cudaMemcpyHostToDevice);
        cudaMemcpy(d_blockTarget, blockTarget32,  32,                  cudaMemcpyHostToDevice);

        /* mine this template until stale (2M nonces) or result found */
        uint64_t templateHashes = 0;
        const uint64_t REFRESH  = 2000000;

        while (templateHashes < REFRESH) {
            /* reset result */
            Result zero = {0};
            cudaMemcpy(d_result, &zero, sizeof(Result), cudaMemcpyHostToDevice);

            mine_kernel<<<BLOCKS, THREADS>>>(
                d_state, d_tail, tailLen,
                d_suffix, suffixLen,
                batchStart,
                d_shareTarget, d_blockTarget,
                d_result
            );
            cudaDeviceSynchronize();

            batchStart      += BATCH;
            templateHashes  += BATCH;
            totalHashes     += BATCH;

            /* check result */
            Result res;
            cudaMemcpy(&res, d_result, sizeof(Result), cudaMemcpyDeviceToHost);

            if (res.type == 2) {
                /* ── block found ── */
                char hashHex[67];
                bytes_to_hex(res.hash, 32, hashHex);

                printf("\n🚀🚀  BLOCK FOUND  nonce=%" PRIu64 "  hash=%s\n",
                       res.nonce, hashHex);

                char body[2048];
                snprintf(body, sizeof(body),
                    "{\"minerAddress\":\"%s\","
                    "\"header\":{\"number\":%s,\"parentHash\":\"%s\","
                    "\"timestamp\":%s,\"miner\":\"%s\","
                    "\"difficulty\":\"%s\",\"transactionsRoot\":\"%s\"},"
                    "\"nonce\":\"%" PRIu64 "\","
                    "\"blockHash\":\"%s\","
                    "\"pendingTxHashes\":[]}",
                    wallet, f_number, f_parentHash, f_timestamp,
                    f_miner, f_difficulty, f_transRoot,
                    res.nonce, hashHex);

                char *resp = http_post(curl, NODE "/api/mining/submit", body);
                printf("Server: %s\n", resp ? resp : "(no response)");
                free(resp);
                break; /* fetch new template */

            } else if (res.type == 1) {
                /* ── share found ── */
                printf("  Share  nonce=%" PRIu64 "\n", res.nonce);

                char body[1024];
                snprintf(body, sizeof(body),
                    "{\"minerAddress\":\"%s\","
                    "\"header\":{\"number\":%s,\"parentHash\":\"%s\","
                    "\"timestamp\":%s,\"miner\":\"%s\","
                    "\"difficulty\":\"%s\",\"transactionsRoot\":\"%s\"},"
                    "\"nonce\":\"%" PRIu64 "\"}",
                    wallet, f_number, f_parentHash, f_timestamp,
                    f_miner, f_difficulty, f_transRoot,
                    res.nonce);

                char *resp = http_post(curl, NODE "/api/mining/share", body);
                free(resp);
                /* keep mining same template */
            }

            /* hashrate report every 10 seconds */
            time_t now = time(NULL);
            if (now - lastReport >= 10) {
                double mhs = (double)totalHashes / (double)(now - lastReport + 1) / 1e6;
                printf("  Hashrate: %.1f MH/s  (total %" PRIu64 " M hashes)\n",
                       mhs, totalHashes / 1000000);
                lastReport  = now;
                totalHashes = 0;
            }
        }
    }

    curl_easy_cleanup(curl);
    curl_global_cleanup();
    return 0;
}
