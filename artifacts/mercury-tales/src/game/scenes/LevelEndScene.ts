import Phaser from 'phaser';
import { TEX } from '../constants';

interface LevelEndData {
  iridiumEarned: number;
}

export class LevelEndScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelEndScene' }); }

  create(data: LevelEndData) {
    const { width: W, height: H } = this.scale;
    const earned = data?.iridiumEarned ?? 0;
    const stolen = Math.floor(earned * 0.45);
    const kept   = earned - stolen;

    // Dark overlay
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(10);
    this.tweens.add({ targets: overlay, fillAlpha: 0.75, duration: 600 });

    // Collector swoops in from right
    const collector = this.add.image(W + 60, H / 2 - 40, TEX.COLLECTOR)
      .setScale(1.8).setDepth(11).setFlipX(true);

    this.tweens.add({
      targets: collector,
      x: W / 2 + 40,
      duration: 700,
      ease: 'Back.easeOut',
      delay: 400,
      onComplete: () => this.showDialog(W, H, earned, stolen, kept, collector),
    });

    // Ominous screen flash
    this.time.delayedCall(350, () => {
      this.cameras.main.flash(300, 80, 0, 0);
      this.cameras.main.shake(400, 0.007);
    });
  }

  private showDialog(W: number, H: number, earned: number, stolen: number, kept: number, collector: Phaser.GameObjects.Image) {
    const panel = this.add.graphics().setDepth(12);
    panel.fillStyle(0x1a0508, 0.97);
    panel.fillRoundedRect(W / 2 - 280, H / 2 - 140, 560, 290, 16);
    panel.lineStyle(2, 0x990000);
    panel.strokeRoundedRect(W / 2 - 280, H / 2 - 140, 560, 290, 16);

    const title = this.add.text(W / 2 - 90, H / 2 - 118, 'THE CHAR COLLECTOR STRIKES!', {
      fontFamily: 'Georgia, serif', fontSize: '17px', color: '#ff4444',
      stroke: '#330000', strokeThickness: 3,
    }).setDepth(13).setOrigin(0.5);

    // Glowing collector eyes re-render
    this.tweens.add({ targets: collector, scaleX: { from: 1.8, to: 2.0 }, scaleY: { from: 1.8, to: 2.0 }, duration: 400, yoyo: true, repeat: -1 });

    const tauntLines = [
      '"Your Iridium belongs to Baron Cinder now!"',
      'Char Collector snatches your coins...',
    ];
    this.add.text(W / 2 - 90, H / 2 - 88, tauntLines.join('\n'), {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#cc8866',
      fontStyle: 'italic', align: 'center', lineSpacing: 5,
    }).setDepth(13).setOrigin(0.5);

    // Animated coin counter ticking down
    const counterLabel = this.add.text(W / 2 - 90, H / 2 - 30, `Iridium earned:  ${earned}`, {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#e8e8e8',
    }).setDepth(13).setOrigin(0.5);

    const stolenLabel = this.add.text(W / 2 - 90, H / 2 + 10, '', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#ff6644',
    }).setDepth(13).setOrigin(0.5);

    const keptLabel = this.add.text(W / 2 - 90, H / 2 + 46, '', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#88cc88',
      stroke: '#003300', strokeThickness: 2,
    }).setDepth(13).setOrigin(0.5);

    // Animate the theft
    let currentStolen = 0;
    this.time.addEvent({
      delay: 40,
      repeat: stolen,
      callback: () => {
        currentStolen = Math.min(currentStolen + 1, stolen);
        counterLabel.setText(`Iridium earned:  ${earned - currentStolen}`);
        counterLabel.setColor(currentStolen > stolen * 0.5 ? '#ff8866' : '#e8e8e8');
        stolenLabel.setText(`Stolen by Collector: -${currentStolen} 💀`);
        if (currentStolen === stolen) {
          keptLabel.setText(`You kept: ${kept} Iridium`);
          this.time.delayedCall(600, () => this.showContinue(W, H, kept, collector));
        }
      },
    });

    // Free character tip
    this.add.text(W / 2 - 90, H / 2 + 130, '💡 Own an NFT Character to fight back against the Collector!', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#886644', fontStyle: 'italic',
    }).setDepth(13).setOrigin(0.5);
  }

  private showContinue(W: number, H: number, kept: number, collector: Phaser.GameObjects.Image) {
    // Collector flies away
    this.tweens.add({ targets: collector, x: W + 80, duration: 500, ease: 'Back.easeIn' });

    const btnBg = this.add.graphics().setDepth(14);
    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0x1a4d1a : 0x0d330d);
      btnBg.fillRoundedRect(W / 2 - 130, H / 2 + 155, 260, 46, 10);
      btnBg.lineStyle(2, hover ? 0x44ff44 : 0x22aa22);
      btnBg.strokeRoundedRect(W / 2 - 130, H / 2 + 155, 260, 46, 10);
    };
    drawBtn(false);

    const continueBtn = this.add.text(W / 2 - 90, H / 2 + 178, '▶  CONTINUE  (kept: ' + kept + ' IRID)', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#88ff88',
      stroke: '#003300', strokeThickness: 2,
    }).setDepth(15).setOrigin(0.5).setInteractive({ useHandCursor: true });

    continueBtn.on('pointerover',  () => { drawBtn(true);  continueBtn.setColor('#ffffff'); });
    continueBtn.on('pointerout',   () => { drawBtn(false); continueBtn.setColor('#88ff88'); });
    continueBtn.on('pointerdown',  () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    });

    this.tweens.add({ targets: continueBtn, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}
