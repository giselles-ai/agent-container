export function HeroSequence() {
	return (
		<div className="mx-auto mt-12 w-full" aria-hidden="true">
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
				{/* ── Without: static, muted ── */}
				<div>
					<p className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-600">
						without
					</p>
					<svg
						viewBox="0 0 400 210"
						fill="none"
						className="w-full h-auto"
						style={{ fontFamily: "inherit" }}
						role="img"
						aria-label="Without Giselle sequence diagram"
					>
						<title>Without Giselle sequence diagram</title>
						{/* Actors */}
						<rect
							x="8"
							y="6"
							width="84"
							height="28"
							rx="6"
							fill="#141418"
							stroke="#1e293b"
							strokeWidth="0.75"
						/>
						<text
							x="50"
							y="24"
							fill="#64748b"
							fontSize="10"
							textAnchor="middle"
							fontWeight="500"
						>
							Your Code
						</text>

						<rect
							x="110"
							y="6"
							width="84"
							height="28"
							rx="6"
							fill="#141418"
							stroke="#1e293b"
							strokeWidth="0.75"
						/>
						<text
							x="152"
							y="24"
							fill="#64748b"
							fontSize="10"
							textAnchor="middle"
							fontWeight="500"
						>
							Sandbox
						</text>

						<rect
							x="212"
							y="6"
							width="84"
							height="28"
							rx="6"
							fill="#141418"
							stroke="#1e293b"
							strokeWidth="0.75"
						/>
						<text
							x="254"
							y="24"
							fill="#64748b"
							fontSize="10"
							textAnchor="middle"
							fontWeight="500"
						>
							Agent
						</text>

						<rect
							x="314"
							y="6"
							width="84"
							height="28"
							rx="6"
							fill="#141418"
							stroke="#1e293b"
							strokeWidth="0.75"
						/>
						<text
							x="356"
							y="24"
							fill="#64748b"
							fontSize="10"
							textAnchor="middle"
							fontWeight="500"
						>
							Browser
						</text>

						{/* Lifelines */}
						<line
							x1="50"
							y1="34"
							x2="50"
							y2="190"
							stroke="#1e293b"
							strokeDasharray="2 4"
						/>
						<line
							x1="152"
							y1="34"
							x2="152"
							y2="190"
							stroke="#1e293b"
							strokeDasharray="2 4"
						/>
						<line
							x1="254"
							y1="34"
							x2="254"
							y2="190"
							stroke="#1e293b"
							strokeDasharray="2 4"
						/>
						<line
							x1="356"
							y1="34"
							x2="356"
							y2="190"
							stroke="#1e293b"
							strokeDasharray="2 4"
						/>

						{/* Step 1: Your Code → Sandbox: create() */}
						<line
							x1="60"
							y1="54"
							x2="138"
							y2="54"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="138,52 142,54 138,56" fill="#334155" />
						<text
							x="100"
							y="49"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							create()
						</text>

						{/* Step 2: Your Code → Agent: prompt() */}
						<line
							x1="60"
							y1="74"
							x2="240"
							y2="74"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="240,72 244,74 240,76" fill="#334155" />
						<text
							x="150"
							y="69"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							prompt()
						</text>

						{/* Step 3: Your Code → Browser: snapshot() */}
						<line
							x1="60"
							y1="94"
							x2="342"
							y2="94"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="342,92 346,94 342,96" fill="#334155" />
						<text
							x="200"
							y="89"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							snapshot()
						</text>

						{/* Step 4: Browser → Your Code: fields */}
						<line
							x1="346"
							y1="114"
							x2="64"
							y2="114"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="64,112 60,114 64,116" fill="#334155" />
						<text
							x="200"
							y="109"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							fields
						</text>

						{/* Step 5: Your Code → Agent: context(fields) */}
						<line
							x1="60"
							y1="134"
							x2="240"
							y2="134"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="240,132 244,134 240,136" fill="#334155" />
						<text
							x="150"
							y="129"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							context(fields)
						</text>

						{/* Step 6: Agent → Your Code: raw text */}
						<line
							x1="244"
							y1="154"
							x2="64"
							y2="154"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="64,152 60,154 64,156" fill="#334155" />
						<text
							x="150"
							y="149"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							raw text
						</text>

						{/* Step 7: Your Code → Browser: execute() */}
						<line
							x1="60"
							y1="174"
							x2="342"
							y2="174"
							stroke="#334155"
							strokeWidth="0.75"
						/>
						<polygon points="342,172 346,174 342,176" fill="#334155" />
						<text
							x="200"
							y="169"
							fill="#334155"
							fontSize="8"
							textAnchor="middle"
						>
							execute()
						</text>

						{/* Bottom annotation */}
						<text
							x="200"
							y="200"
							fill="#1e293b"
							fontSize="8"
							textAnchor="middle"
							fontStyle="italic"
						>
							parse · convert · cleanup …
						</text>
					</svg>
				</div>

				{/* ── With giselle(): animated, bright ── */}
				<div>
					<p className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">
						with{" "}
						<code className="font-mono text-xs normal-case tracking-normal text-emerald-400/80">
							giselle()
						</code>
					</p>
					<svg
						viewBox="0 0 400 210"
						fill="none"
						className="seq-root w-full h-auto"
						style={{ fontFamily: "inherit" }}
						role="img"
						aria-label="With Giselle sequence diagram"
					>
						<title>With Giselle sequence diagram</title>
						<defs>
							<filter id="seq-glow">
								<feGaussianBlur stdDeviation="4" result="blur" />
								<feMerge>
									<feMergeNode in="blur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>

						{/* Actor: Your Code (cx=67) */}
						<g className="seq-actor">
							<rect
								x="15"
								y="6"
								width="105"
								height="32"
								rx="8"
								fill="#141418"
								stroke="#1e293b"
								strokeWidth="0.75"
							/>
							<circle cx="31" cy="20" r="2.5" fill="#22d3ee" />
							<text x="38" y="22" fill="#e2e8f0" fontSize="10" fontWeight="500">
								Your Code
							</text>
							<text x="31" y="33" fill="#475569" fontSize="7">
								streamText + useChat
							</text>
						</g>

						{/* Actor: Agent (cx=200) */}
						<g className="seq-actor">
							<rect
								x="148"
								y="6"
								width="105"
								height="32"
								rx="8"
								fill="#141418"
								stroke="#1e293b"
								strokeWidth="0.75"
							/>
							<circle cx="164" cy="20" r="2.5" fill="#a78bfa" />
							<text
								x="171"
								y="22"
								fill="#e2e8f0"
								fontSize="10"
								fontWeight="500"
							>
								Agent
							</text>
							<text x="164" y="33" fill="#475569" fontSize="7">
								Gemini CLI in Sandbox
							</text>
						</g>

						{/* Actor: Form (cx=332) */}
						<g className="seq-actor">
							<rect
								x="280"
								y="6"
								width="105"
								height="32"
								rx="8"
								fill="#141418"
								stroke="#1e293b"
								strokeWidth="0.75"
							/>
							<circle cx="296" cy="20" r="2.5" fill="#34d399" />
							<text
								x="303"
								y="22"
								fill="#e2e8f0"
								fontSize="10"
								fontWeight="500"
							>
								Form
							</text>
							<text x="296" y="33" fill="#475569" fontSize="7">
								browser-tool (DOM)
							</text>
						</g>

						{/* Lifelines */}
						<line
							x1="67"
							y1="38"
							x2="67"
							y2="195"
							stroke="#1e293b"
							strokeDasharray="3 5"
							className="seq-actor"
						/>
						<line
							x1="200"
							y1="38"
							x2="200"
							y2="195"
							stroke="#1e293b"
							strokeDasharray="3 5"
							className="seq-actor"
						/>
						<line
							x1="332"
							y1="38"
							x2="332"
							y2="195"
							stroke="#1e293b"
							strokeDasharray="3 5"
							className="seq-actor"
						/>

						{/* Step 1: Your Code → Agent: streamText() */}
						<g className="seq-step-1">
							<line
								x1="77"
								y1="64"
								x2="186"
								y2="64"
								stroke="#22d3ee"
								strokeWidth="1"
								strokeOpacity="0.5"
							/>
							<polygon
								points="186,61 192,64 186,67"
								fill="#22d3ee"
								fillOpacity="0.5"
							/>
							<text
								x="132"
								y="57"
								fill="#475569"
								fontSize="9"
								textAnchor="middle"
							>
								streamText()
							</text>
						</g>
						<circle
							cx="77"
							cy="64"
							r="3"
							fill="#22d3ee"
							filter="url(#seq-glow)"
							className="seq-dot-1"
						/>

						{/* Step 2: Agent → Form: snapshot() */}
						<g className="seq-step-2">
							<line
								x1="210"
								y1="92"
								x2="318"
								y2="92"
								stroke="#a78bfa"
								strokeWidth="1"
								strokeOpacity="0.5"
							/>
							<polygon
								points="318,89 324,92 318,95"
								fill="#a78bfa"
								fillOpacity="0.5"
							/>
							<text
								x="264"
								y="85"
								fill="#475569"
								fontSize="9"
								textAnchor="middle"
							>
								snapshot()
							</text>
						</g>
						<circle
							cx="210"
							cy="92"
							r="3"
							fill="#a78bfa"
							filter="url(#seq-glow)"
							className="seq-dot-2"
						/>

						{/* Step 3: Form → Agent: fields */}
						<g className="seq-step-3">
							<line
								x1="322"
								y1="120"
								x2="214"
								y2="120"
								stroke="#34d399"
								strokeWidth="1"
								strokeOpacity="0.5"
							/>
							<polygon
								points="214,117 208,120 214,123"
								fill="#34d399"
								fillOpacity="0.5"
							/>
							<text
								x="268"
								y="113"
								fill="#475569"
								fontSize="9"
								textAnchor="middle"
							>
								fields
							</text>
						</g>
						<circle
							cx="322"
							cy="120"
							r="3"
							fill="#34d399"
							filter="url(#seq-glow)"
							className="seq-dot-3"
						/>

						{/* Step 4: Agent → Form: execute() */}
						<g className="seq-step-4">
							<line
								x1="210"
								y1="148"
								x2="318"
								y2="148"
								stroke="#a78bfa"
								strokeWidth="1"
								strokeOpacity="0.5"
							/>
							<polygon
								points="318,145 324,148 318,151"
								fill="#a78bfa"
								fillOpacity="0.5"
							/>
							<text
								x="264"
								y="141"
								fill="#475569"
								fontSize="9"
								textAnchor="middle"
							>
								execute()
							</text>
						</g>
						<circle
							cx="210"
							cy="148"
							r="3"
							fill="#a78bfa"
							filter="url(#seq-glow)"
							className="seq-dot-4"
						/>

						{/* Step 5: Form → Your Code: ✓ form filled */}
						<g className="seq-step-5">
							<line
								x1="322"
								y1="176"
								x2="81"
								y2="176"
								stroke="#34d399"
								strokeWidth="1"
								strokeOpacity="0.5"
							/>
							<polygon
								points="81,173 75,176 81,179"
								fill="#34d399"
								fillOpacity="0.5"
							/>
							<text
								x="200"
								y="169"
								fill="#34d399"
								fontSize="9"
								textAnchor="middle"
								fontWeight="500"
							>
								✓ form filled
							</text>
						</g>
						<circle
							cx="322"
							cy="176"
							r="3"
							fill="#34d399"
							filter="url(#seq-glow)"
							className="seq-dot-5"
						/>
					</svg>
				</div>
			</div>
		</div>
	);
}
