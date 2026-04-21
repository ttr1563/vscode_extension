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
- `TabGroup Extra: 選択タブを既存グループへ追加`
- `TabGroup Extra: 復元する`
- `TabGroup Extra: グループを閉じる`
- `TabGroup Extra: 削除する`
- `TabGroup Extra: 絶対パスをコピー`
- `TabGroup Extra: 相対パスをコピー`

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
   - グループを展開すると、保存された各タブ名 + パスを確認できる
   - 項目にホバーするとツールチップで詳細情報を確認できる

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
- そのため、タブ上部に線を引くなどタブUI自体へのワンポイント装飾も、公開 API の範囲では困難です。
- 本拡張では、保存グループに色ラベルを保持し、一覧表示と操作性を重視した実装にしています。
- VS Code 標準タブはユーザーが個別に移動可能であり、拡張側で完全固定はできません。


## 公開用アイコンについて（結論）

- はい、**tab group 切り替えっぽいアイコン**に変更できます。
- 今回 Activity Bar 用の `media/tabgroup.svg` は、タブ群 + 切り替え矢印の見た目に更新しました。
- ただし Marketplace 公開時に重要なのは、**拡張パッケージアイコン**（`package.json` の `icon`）です。

### 1) 自分で作るべき？

- 可能なら **自作を推奨** です（ブランド衝突・ライセンス事故を避けやすいため）。
- 外部素材を使う場合は、商用利用・再配布・改変可否を必ず確認してください。

### 2) どんな条件がある？（実務で押さえるポイント）

1. **ライセンスが明確**
   - 使用素材のライセンス文書/URLを保管する。
2. **識別性がある**
   - 小さいサイズでも潰れない（16px〜128px程度で視認）。
3. **背景とのコントラスト**
   - VS Code のライト/ダーク双方で見える色設計。
4. **誤認を招かない**
   - 他製品ロゴ（Chrome 公式ロゴ等）に寄せすぎない。
5. **拡張パッケージ用アイコンを別途設定**
   - Marketplace 表示は `package.json` の `icon` が対象。

### 3) すぐ公開するなら最小構成

- Activity Bar アイコン（今ある `media/tabgroup.svg`）
- Marketplace アイコン（例: `media/marketplace-icon.png` など）
- `package.json` の `icon` 追加

必要であれば次の対応として、`package.json` に公開用 `icon` を追加し、推奨サイズの雛形（PNG/SVG）までこちらで作成します。
