export function HeroDemoMockup() {
	return (
		<div className="demo-root" aria-hidden="true">
			<svg
				viewBox="0 0 560 310"
				fill="none"
				className="w-full h-auto"
				style={{ fontFamily: "inherit" }}
			>
				<defs>
					<filter id="demo-shadow" x="-10%" y="-5%" width="120%" height="120%">
						<feDropShadow
							dx="0"
							dy="4"
							stdDeviation="10"
							floodColor="#000"
							floodOpacity="0.4"
						/>
					</filter>
				</defs>

				{/* ── Main window ── */}
				<rect
					x="0.5"
					y="0.5"
					width="519"
					height="249"
					rx="10"
					fill="#141418"
					stroke="#1e293b"
					strokeWidth="1"
				/>

				{/* Title bar */}
				<circle cx="16" cy="14" r="3.5" fill="#27272a" />
				<circle cx="30" cy="14" r="3.5" fill="#27272a" />
				<circle cx="44" cy="14" r="3.5" fill="#27272a" />
				<line
					x1="0"
					y1="28"
					x2="520"
					y2="28"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>

				{/* Panel divider */}
				<line
					x1="280"
					y1="28"
					x2="280"
					y2="250"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>

				{/* ── Left panel: Form ── */}
				<text x="16" y="50" fill="#94a3b8" fontSize="10" fontWeight="600">
					Expense Report
				</text>

				{/* Field 1: Service */}
				<text x="16" y="78" fill="#475569" fontSize="8">
					Service
				</text>
				<rect
					x="78"
					y="68"
					width="190"
					height="16"
					rx="3"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<rect
					x="78"
					y="68"
					width="190"
					height="16"
					rx="3"
					fill="#22d3ee"
					fillOpacity="0.04"
					stroke="#22d3ee"
					strokeWidth="0.5"
					strokeOpacity="0.2"
					className="demo-hl1"
				/>
				<text x="86" y="80" fill="#22d3ee" fontSize="9" className="demo-f1">
					OpenAI
				</text>

				{/* Field 2: Date */}
				<text x="16" y="106" fill="#475569" fontSize="8">
					Date
				</text>
				<rect
					x="78"
					y="96"
					width="190"
					height="16"
					rx="3"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<rect
					x="78"
					y="96"
					width="190"
					height="16"
					rx="3"
					fill="#22d3ee"
					fillOpacity="0.04"
					stroke="#22d3ee"
					strokeWidth="0.5"
					strokeOpacity="0.2"
					className="demo-hl2"
				/>
				<text x="86" y="108" fill="#22d3ee" fontSize="9" className="demo-f2">
					2026-02-15
				</text>

				{/* Field 3: Amount */}
				<text x="16" y="134" fill="#475569" fontSize="8">
					Amount
				</text>
				<rect
					x="78"
					y="124"
					width="190"
					height="16"
					rx="3"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<rect
					x="78"
					y="124"
					width="190"
					height="16"
					rx="3"
					fill="#22d3ee"
					fillOpacity="0.04"
					stroke="#22d3ee"
					strokeWidth="0.5"
					strokeOpacity="0.2"
					className="demo-hl3"
				/>
				<text x="86" y="136" fill="#22d3ee" fontSize="9" className="demo-f3">
					$342.50
				</text>

				{/* Field 4: Invoice # */}
				<text x="16" y="162" fill="#475569" fontSize="8">
					Invoice #
				</text>
				<rect
					x="78"
					y="152"
					width="190"
					height="16"
					rx="3"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<rect
					x="78"
					y="152"
					width="190"
					height="16"
					rx="3"
					fill="#22d3ee"
					fillOpacity="0.04"
					stroke="#22d3ee"
					strokeWidth="0.5"
					strokeOpacity="0.2"
					className="demo-hl4"
				/>
				<text x="86" y="164" fill="#22d3ee" fontSize="9" className="demo-f4">
					INV-48271
				</text>

				{/* Field 5: Memo */}
				<text x="16" y="190" fill="#475569" fontSize="8">
					Memo
				</text>
				<rect
					x="78"
					y="180"
					width="190"
					height="30"
					rx="3"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<rect
					x="78"
					y="180"
					width="190"
					height="30"
					rx="3"
					fill="#22d3ee"
					fillOpacity="0.04"
					stroke="#22d3ee"
					strokeWidth="0.5"
					strokeOpacity="0.2"
					className="demo-hl5"
				/>
				<text x="86" y="194" fill="#22d3ee" fontSize="8" className="demo-f5">
					Monthly API usage
				</text>
				<text x="86" y="205" fill="#22d3ee" fontSize="8" className="demo-f5">
					charges for Feb 2026
				</text>

				{/* ── Right panel: Chat ── */}
				<text x="294" y="50" fill="#94a3b8" fontSize="10" fontWeight="600">
					Chat
				</text>

				{/* User message (right-aligned) */}
				<g className="demo-msg">
					<rect x="356" y="62" width="150" height="28" rx="8" fill="#1e293b" />
					<text x="366" y="80" fill="#e2e8f0" fontSize="8">
						Fill in the expense report
					</text>
				</g>

				{/* Agent reply in chat (appears when done) */}
				<g className="demo-t3">
					<rect
						x="294"
						y="100"
						width="148"
						height="26"
						rx="8"
						fill="#0e0e10"
						stroke="#1e293b"
						strokeWidth="0.5"
					/>
					<text x="306" y="117" fill="#34d399" fontSize="8" fontWeight="500">
						✓ Form filled — 5 fields
					</text>
				</g>

				{/* Input field */}
				<rect
					x="292"
					y="224"
					width="214"
					height="18"
					rx="5"
					fill="#0a0a0c"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<text x="302" y="236" fill="#334155" fontSize="8">
					Type a message...
				</text>

				{/* ── Floating Agent window ── */}
				<g className="demo-agent">
					<rect
						x="336"
						y="148"
						width="216"
						height="152"
						rx="8"
						fill="#141418"
						stroke="#1e293b"
						strokeWidth="1"
						filter="url(#demo-shadow)"
					/>

					{/* Title bar */}
					<circle cx="350" cy="162" r="2.5" fill="#27272a" />
					<circle cx="362" cy="162" r="2.5" fill="#27272a" />
					<circle cx="374" cy="162" r="2.5" fill="#27272a" />
					<circle cx="390" cy="162" r="2" fill="#a78bfa" />
					<text x="398" y="165" fill="#e2e8f0" fontSize="9" fontWeight="500">
						Agent
					</text>
					<text x="434" y="165" fill="#475569" fontSize="7">
						Gemini CLI
					</text>
					<line
						x1="336"
						y1="174"
						x2="552"
						y2="174"
						stroke="#1e293b"
						strokeWidth="0.5"
					/>

					{/* Terminal content */}
					<text x="350" y="196" fill="#475569" fontSize="8" className="demo-t1">
						› Reading receipt...
					</text>
					<text x="350" y="214" fill="#475569" fontSize="8" className="demo-t2">
						› Filling form fields...
					</text>
					<text
						x="350"
						y="240"
						fill="#34d399"
						fontSize="9"
						fontWeight="500"
						className="demo-t3"
					>
						✓ Complete
					</text>

					{/* Blinking cursor */}
					<rect
						x="350"
						y="250"
						width="5"
						height="10"
						rx="1"
						fill="#a78bfa"
						fillOpacity="0.5"
						className="demo-cursor"
					/>
				</g>
			</svg>
		</div>
	);
}
