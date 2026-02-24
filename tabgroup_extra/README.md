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

## 開発

```bash
npm install
npm run compile
```

F5 で Extension Development Host を起動して確認してください。
