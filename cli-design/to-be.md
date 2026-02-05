`packages/cli`に作成する. 名前は`@giselles-ai/agent`.

### Create
`@giselles-ai/agent create` でエージェント作成ウィザードを開始します。
エージェント作成ウィザードはエージェントの名前を入力してもらいます。
入力されたらカレントディレクトリに{name}でディレクトリを作成し、config.tomlを作成します。


### config.toml

詳細な仕様は[./tobe.config.toml](./tobe.config.toml)

`@giselles-ai/agent create`で作成した時点ではversionとnameのみ入った状態。


```toml
# config.toml(default)
version = "alpha"

name = "{name}"
```


### Add skill

`@giselles-ai/agent add-skill PATH` でCWDの`config.toml`にskillsを追加します。

#### 制約

`config.toml`の存在するディレクトリでのみ実行可能です。versionが存在しない、サポートしているバージョンでない場合はエラーにします。

`PATH`はCWD以下に限ります。`../../skills` はエラーにします。
`PATH`はディレクトリに限ります。ファイルの場合はエラーにします。

#### 動作イメージ

```
greeting-agent
├── skills
│   └── pptx
│       ├── LICENSE.txt
│       ├── SKILL.md
│       ├── editing.md
│       ├── pptxgenjs.md
│       └── scripts
└── config.toml
```

```
$ pwd # -> /path/to/greeting-agent
$ @giselles-ai/agent add-skill skills/pptx
```

```toml
version = "alpha"

name = "{name}"

[[skills]]
path = "skills/pptx"
```

### Edit setup script

`@giselles-ai/agent edit-setup-script` でCWDの`config.toml`のsetup.scriptを編集プロンプトを表示します。既存の入力内容がある場合はそれが表示され編集できます。

編集プロンプトは複数行入力可能です。
