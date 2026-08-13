export const Placeholder = ({
	title,
	blurb,
}: {
	title: string;
	blurb: string;
}) => (
	<>
		<h1 className="page-title">{title}</h1>
		<p className="page-sub">{blurb}</p>
		<section className="panel">
			<div className="panel-header">Coming online</div>
			<div className="panel-body">
				<p className="muted">
					Screen shell is in place. Next pass wires the BBGM worker view for this
					module into the Draft Day-style layout.
				</p>
			</div>
		</section>
	</>
);
