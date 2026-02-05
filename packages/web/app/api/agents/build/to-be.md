同じディレクトリに`[slug]/`がありますがこれは過去の実装なので、参考にしないでください。

### 要件
Vercel Sandboxを作成し、アップロードされたtarファイルを展開し、各情報をSandboxに反映した上でSnapshotを作成し、Snapshot IdをResponseしてください。

穴埋め式のコードを[./route.ts](./route.ts)に配置しています。

tarファイルの中身は[~/cli-design/to-be.md](../../../../../../cli-design/to-be.md)に書いてあります。
config.tomlが重要で、あとはそこから参照できるはずです。
