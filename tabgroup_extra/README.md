# TabGroup Extra

Chrome のタブグループ風に、VS Code のタブ操作を補助する拡張機能です。

## できること

- 複数タブ（またはアクティブタブ）を選択して **グループとして保存**
- グループ作成時に **色ラベル** を付与
- 保存済みグループの **復元 / タブ一括クローズ / 削除**
- 次の 2 つの導線で操作可能
  - `Cmd/Ctrl + Shift + P` のコマンドパレット
  - Activity Bar の `Tab Groups` アイコンから開く `Saved Groups` ビュー

> 補足: VS Code API の制約上、「ネイティブなタブグループ色を直接変更」ではなく、拡張機能内の保存データに色ラベルを持たせる方式を採用しています。

## コマンド

- `TabGroup Extra: 選択タブからグループ作成`
- `TabGroup Extra: グループを復元`
- `TabGroup Extra: グループのタブを閉じる`
- `TabGroup Extra: グループを削除`

## 検証手順（ローカル開発）

### 1) 依存インストールとコンパイル

```bash
cd tabgroup_extra
npm install
npm run compile
```

`out/extension.js` が生成されればコンパイル成功です。

### 2) VS Code で拡張を起動して試す（最も簡単）

1. VS Code で `tabgroup_extra` フォルダを開く
2. `F5` を押す（Extension Development Host が起動）
3. 新しく起動した VS Code 側で以下を確認
   - `Cmd/Ctrl + Shift + P` で `TabGroup Extra:` コマンドが表示される
   - Activity Bar に `Tab Groups` アイコンが表示される
   - `Saved Groups` ビューで保存グループが見える

### 3) 動作チェック観点

- タブを複数選択して「選択タブからグループ作成」が実行できる
- 色選択・グループ名入力後に保存される
- `Saved Groups` から復元できる
- 右メニュー（コンテキスト）から閉じる・削除が実行できる

## VS Code へ入れ込む方法（配布/導入）

はい、**コンパイル後に VS Code に入れ込む形**でも使えます。主に 2 パターンです。

### A. 開発時（推奨）

- 上記の `F5` 起動で即確認（インストール不要）

### B. `.vsix` を作ってインストール

```bash
cd tabgroup_extra
npm install
npm run compile
npx @vscode/vsce package
```

生成された `tabgroup-extra-0.0.1.vsix` を VS Code にインストールします。

- GUI: `Extensions` 画面右上 `...` → `Install from VSIX...`
- CLI: `code --install-extension tabgroup-extra-0.0.1.vsix`

## トラブルシュート

- `npm install` で 403 が出る場合
  - ネットワーク制限や社内レジストリ設定の影響です
  - 利用可能な npm レジストリ設定に切り替えて再実行してください


## 仕様上の注意点

- VS Code API の制約により、Chrome のようなネイティブな「タブ自体への色塗り」はできません。
- 本拡張では、保存グループに色ラベルを保持し、一覧表示と操作性を重視した実装にしています。
- VS Code 標準タブはユーザーが個別に移動可能であり、拡張側で完全固定はできません。
