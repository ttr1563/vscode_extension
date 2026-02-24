import * as vscode from 'vscode';

type GroupColor = 'grey' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'pink';

interface SavedTabEntry {
  readonly uri: string;
  readonly previewLabel: string;
}

interface SavedTabGroup {
  readonly id: string;
  readonly name: string;
  readonly color: GroupColor;
  readonly tabs: SavedTabEntry[];
  readonly createdAt: string;
}

const STORAGE_KEY = 'tabgroupExtra.savedGroups';
const COLOR_ITEMS: ReadonlyArray<{ readonly label: string; readonly color: GroupColor }> = [
  { label: 'Grey', color: 'grey' },
  { label: 'Blue', color: 'blue' },
  { label: 'Green', color: 'green' },
  { label: 'Yellow', color: 'yellow' },
  { label: 'Orange', color: 'orange' },
  { label: 'Red', color: 'red' },
  { label: 'Purple', color: 'purple' },
  { label: 'Pink', color: 'pink' }
];

class SavedGroupItem extends vscode.TreeItem {
  constructor(public readonly group: SavedTabGroup) {
    super(`${group.name} (${group.tabs.length})`, vscode.TreeItemCollapsibleState.None);
    this.description = `${group.color} • ${new Date(group.createdAt).toLocaleString()}`;
    this.contextValue = 'tabGroupItem';
    this.tooltip = `${group.name}\nColor: ${group.color}\nTabs: ${group.tabs.map((tab) => tab.previewLabel).join(', ')}`;
    this.command = {
      command: 'tabgroupExtra.restoreGroup',
      title: 'Restore Group',
      arguments: [group]
    };
  }
}

class SavedGroupsProvider implements vscode.TreeDataProvider<SavedGroupItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SavedGroupItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SavedGroupItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): SavedGroupItem[] {
    return readSavedGroups(this.context).map((group) => new SavedGroupItem(group));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SavedGroupsProvider(context);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('tabgroupExtra.savedGroupsView', provider));

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.refreshSavedGroups', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.createGroupFromSelection', async (...args: unknown[]) => {
      const tabs = collectTabsFromContext(args);

      if (tabs.length === 0) {
        vscode.window.showWarningMessage('タブが取得できませんでした。タブを選択してから実行してください。');
        return;
      }

      const groupName = await vscode.window.showInputBox({
        prompt: '作成するグループ名を入力してください',
        placeHolder: '例: API改修タスク'
      });

      if (!groupName || groupName.trim() === '') {
        return;
      }

      const selectedColorItem = await vscode.window.showQuickPick(
        COLOR_ITEMS.map((colorItem) => ({
          label: colorItem.label,
          description: colorItem.color,
          color: colorItem.color
        })),
        { placeHolder: 'グループの色を選択してください' }
      );

      if (!selectedColorItem) {
        return;
      }

      const savedGroup: SavedTabGroup = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: groupName.trim(),
        color: selectedColorItem.color,
        tabs: tabs,
        createdAt: new Date().toISOString()
      };

      const savedGroups = readSavedGroups(context);
      savedGroups.unshift(savedGroup);
      await context.globalState.update(STORAGE_KEY, savedGroups);

      provider.refresh();
      vscode.window.showInformationMessage(`グループ「${savedGroup.name}」を保存しました。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.restoreGroup', async (input?: SavedTabGroup) => {
      const selectedGroup = await resolveGroupSelection(context, input);
      if (!selectedGroup) {
        return;
      }

      for (const savedTab of selectedGroup.tabs) {
        try {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(savedTab.uri));
          await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
        } catch {
          vscode.window.showWarningMessage(`復元できないタブがあります: ${savedTab.previewLabel}`);
        }
      }

      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」を復元しました。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.closeGroupTabs', async (input?: SavedTabGroup) => {
      const selectedGroup = await resolveGroupSelection(context, input);
      if (!selectedGroup) {
        return;
      }

      const uriSet = new Set<string>(selectedGroup.tabs.map((tab) => tab.uri));
      const closableTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof vscode.TabInputText)
        .filter((tab) => uriSet.has((tab.input as vscode.TabInputText).uri.toString()));

      if (closableTabs.length === 0) {
        vscode.window.showInformationMessage('現在開かれている該当タブはありません。');
        return;
      }

      await vscode.window.tabGroups.close(closableTabs, true);
      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」のタブを閉じました。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.deleteGroup', async (input?: SavedTabGroup) => {
      const selectedGroup = await resolveGroupSelection(context, input);
      if (!selectedGroup) {
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `グループ「${selectedGroup.name}」を削除します。`,
        { modal: true },
        '削除する'
      );

      if (confirmation !== '削除する') {
        return;
      }

      const remaining = readSavedGroups(context).filter((group) => group.id !== selectedGroup.id);
      await context.globalState.update(STORAGE_KEY, remaining);
      provider.refresh();
      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」を削除しました。`);
    })
  );
}

function collectTabsFromContext(args: unknown[]): SavedTabEntry[] {
  const tabsFromArgs = normalizeTabsFromArgs(args);
  if (tabsFromArgs.length > 0) {
    return tabsFromArgs;
  }

  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!activeTab || !(activeTab.input instanceof vscode.TabInputText)) {
    return [];
  }

  return [{
    uri: activeTab.input.uri.toString(),
    previewLabel: activeTab.label
  }];
}

function normalizeTabsFromArgs(args: unknown[]): SavedTabEntry[] {
  const tabCandidates = args.flatMap((arg) => {
    if (arg instanceof vscode.Tab) {
      return [arg];
    }

    if (Array.isArray(arg)) {
      return arg.filter((item): item is vscode.Tab => item instanceof vscode.Tab);
    }

    const maybeTabs = (arg as { tabs?: unknown } | undefined)?.tabs;
    if (Array.isArray(maybeTabs)) {
      return maybeTabs.filter((item): item is vscode.Tab => item instanceof vscode.Tab);
    }

    return [];
  });

  const mappedTabs = tabCandidates
    .filter((tab) => tab.input instanceof vscode.TabInputText)
    .map((tab) => ({
      uri: (tab.input as vscode.TabInputText).uri.toString(),
      previewLabel: tab.label
    }));

  return dedupeByUri(mappedTabs);
}

function dedupeByUri(entries: SavedTabEntry[]): SavedTabEntry[] {
  const map = new Map<string, SavedTabEntry>();
  for (const entry of entries) {
    map.set(entry.uri, entry);
  }

  return [...map.values()];
}

async function resolveGroupSelection(
  context: vscode.ExtensionContext,
  input?: SavedTabGroup
): Promise<SavedTabGroup | undefined> {
  if (input) {
    return input;
  }

  const savedGroups = readSavedGroups(context);
  if (savedGroups.length === 0) {
    vscode.window.showInformationMessage('保存済みグループはまだありません。');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    savedGroups.map((group) => ({
      label: group.name,
      description: `${group.color} • ${group.tabs.length} tabs`,
      group
    })),
    { placeHolder: '操作するグループを選択してください' }
  );

  return picked?.group;
}

function readSavedGroups(context: vscode.ExtensionContext): SavedTabGroup[] {
  const saved = context.globalState.get<SavedTabGroup[]>(STORAGE_KEY);
  return Array.isArray(saved) ? saved : [];
}

export function deactivate(): void {
  // no-op
}
