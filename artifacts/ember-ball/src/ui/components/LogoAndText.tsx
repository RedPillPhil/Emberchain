import { memo } from "react";
import { GAME_NAME } from "../../common/constants.ts";

type Props = {
	gold?: boolean;
	inLeague?: boolean;
	updating: boolean;
};
const LogoAndText = memo(({ inLeague }: Props) => {
	return (
		<a
			className={
				inLeague
					? "navbar-brand d-none d-md-inline ms-md-2 ms-lg-0 ember-brand"
					: "navbar-brand ember-brand"
			}
			href="/"
		>
			<img
				alt="Ember Ball"
				className="ember-logo"
				width="52"
				height="52"
				src="/img/ember-ball-logo.png"
			/>
			<span className={inLeague ? "d-none d-lg-inline" : undefined}>
				{GAME_NAME}
			</span>
		</a>
	);
});

export default LogoAndText;
