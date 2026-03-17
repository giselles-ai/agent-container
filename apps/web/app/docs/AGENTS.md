## ./page.tsx で書くべきもの（Left naviに並ぶイメージ）

### Core concepts
- Features

  https://docs.openclaw.ai/concepts/features のような感じ

### First steps
- Getting Started

   `npx skills add giselles-ai/agent-container` して、`build-giselle-agent` skillを使って作ることを前提にする。

   docs上の説明も、「Giselle Sandbox Agentの仕組みを自力で細かく説明して指示する」のではなく、
   「使っているcoding agentに build-giselle-agent skill を使わせて、作りたいappの本質だけ伝える」
   という流れに寄せる。

   つまり、First steps では以下の順に案内する。

   1. `npx skills add giselles-ai/agent-container`
   2. Codex / Claude Code / Cursor などに `build-giselle-agent` skill を使ってもらう
   3. ユーザーは app の種類と欲しい体験だけ伝える

   prompt例も、実装手順を細かく指示するものではなく、skillが不足情報をヒアリングしながら進められる
   レベルまで単純化したものにする。

   例:

   - workspace report app を作りたい。`build-giselle-agent` skillを使って、workspace内のファイルを読み、`./artifacts/` にレポートを書き、UIからダウンロードできるNext.js appを作って。
   - OpenClaw-like chat app を作りたい。`build-giselle-agent` skillを使って、Vercel上で動く inspectable な chat app を作って。必要なら provider や UI 構成は質問して決めて。
   - browser-tool agent を作りたい。`build-giselle-agent` skillを使って、ページを inspect / click / fill できる agent app を作って。browser tool が必要な箇所は適切に組み込んで。
   - personal assistant app を作りたい。`build-giselle-agent` skillを使って、workspace と artifacts を活かした file-oriented な assistant を作って。

- Update agent

   更新時も同じ `build-giselle-agent` skill を使う前提に変える。

   「一度作ったAgentを、skill経由で diff-first に更新できる」ことを紹介する。
   ファイル追加、artifact download追加、browser tool追加、provider切り替えなどを、
   最小差分で変更し、その結果がgit diffとして人間に読めることを伝える。


### Guides
- Personal Assistant Setup
- build-giselle-agent skill


## build-giselle-agent skill について

../../../../skills/build-giselle-agent を前提に書く。

このskillは、
- 現在のGiselle Sandbox Agentのcapabilitiesを踏まえて
- buildレシピを選び
- 必要な不足情報をヒアリングし
- buildだけでなく update も diff-first に進める

という形で紹介する。

docs側では、skillの内部実装を説明しすぎず、
「このskillを使えば、workspace-report / agent-inbox / browser-tool / personal assistant などの形を素早く作れる」
ことが伝わればよい。
