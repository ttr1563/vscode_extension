# TabGroup Extra 設計メモ

## 1. 背景

ユーザー要望:
- タブの複数選択時に、メニューから色分け＋グループ化したい
- 復元機能を用意したい
- 保存領域を、拡張機能アイコンまたはコマンドパレットから確認したい
- 標準的に使うコマンド（復元、閉じる、削除）を右クリック導線でも操作したい

## 2. 方針

### 2.1 最小変更の原則

既存コードがないため、リポジトリ直下の `tabgroup_extra/` に閉じた構成で新規作成。
将来的に別拡張へ組み込みやすいよう、依存を最小化。

### 2.2 API 制約への対応

VS Code の公開 API では、Chrome のようにネイティブタブの見た目を完全再現することは難しいため、
「タブ集合 + 色ラベル」を拡張機能ストレージ (`globalState`) に保存する。

### 2.3 UX 導線

- Command Palette (`Cmd/Ctrl + Shift + P`) 経由
- Activity Bar の独自アイコン (`Tab Groups`) 経由
- Tree View (`Saved Groups`) の項目コンテキストメニューで復元・閉じる・削除

## 3. データモデル

```ts
SavedTabGroup {
  id: string;
  name: string;
  color: 'grey' | 'blue' | ...;
  tabs: { uri: string; previewLabel: string }[];
  createdAt: string;
}
```

保存キー: `tabgroupExtra.savedGroups`

## 4. 実装詳細

1. **グループ作成**
   - コマンド引数から `vscode.Tab` 配列を可能な限り抽出
   - 取得できない場合はアクティブタブをフォールバック
   - グループ名 + 色を入力して保存

2. **グループ復元**
   - 保存 URI を順に `openTextDocument` -> `showTextDocument`
   - 開けないファイルがあっても処理継続

3. **グループのタブを閉じる**
   - 現在開いている全タブから URI マッチするものを抽出
   - `vscode.window.tabGroups.close(...)` で一括クローズ

4. **グループ削除**
   - モーダル確認後にストレージから削除

## 5. 今後の拡張候補

- グループ名の編集
- ソート（作成日時 / 名前）
- ワークスペース単位保存 (`workspaceState`) との切り替え
- ピン留めグループ
