import * as vscode from 'vscode';
import * as path from 'path';

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

interface TabLike {
  readonly label: string;
  readonly input: unknown;
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

const COLOR_BADGE: Record<GroupColor, string> = {
  grey: '⚪',
  blue: '🔵',
  green: '🟢',
  yellow: '🟡',
  orange: '🟠',
  red: '🔴',
  purple: '🟣',
  pink: '🩷'
};

class SavedGroupItem extends vscode.TreeItem {
  constructor(public readonly group: SavedTabGroup) {
    super(`${COLOR_BADGE[group.color]} ${group.name} (${group.tabs.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${new Date(group.createdAt).toLocaleString()}`;
    this.contextValue = 'tabGroupItem';
    this.tooltip = new vscode.MarkdownString([
      `**${group.name}**`,
      '',
      `- Color: ${group.color}`,
      `- Tabs: ${group.tabs.length}`,
      '',
      ...group.tabs.map((tab) => `- ${tab.previewLabel} (${compactPath(tab.uri)})`)
    ].join('\n'));
    this.iconPath = new vscode.ThemeIcon('folder-library');
  }
}

class SavedTabEntryItem extends vscode.TreeItem {
  constructor(public readonly group: SavedTabGroup, public readonly tab: SavedTabEntry) {
    super(tab.previewLabel, vscode.TreeItemCollapsibleState.None);
    this.description = compactPath(tab.uri);
    this.contextValue = 'tabGroupTabItem';
    this.iconPath = new vscode.ThemeIcon('file');
    this.tooltip = new vscode.MarkdownString(`**${tab.previewLabel}**\n\nPath: ${tab.uri}`);
    this.command = {
      command: 'tabgroupExtra.openSavedTab',
      title: 'タブを開く',
      arguments: [tab]
    };
  }
}

class SavedGroupsProvider implements vscode.TreeDataProvider<SavedGroupItem | SavedTabEntryItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SavedGroupItem | SavedTabEntryItem | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SavedGroupItem | SavedTabEntryItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: SavedGroupItem | SavedTabEntryItem): Array<SavedGroupItem | SavedTabEntryItem> {
    if (!element) {
      return readSavedGroups(this.context).map((group) => new SavedGroupItem(group));
    }

    if (element instanceof SavedGroupItem) {
      return element.group.tabs.map((tab) => new SavedTabEntryItem(element.group, tab));
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SavedGroupsProvider(context);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('tabgroupExtra.savedGroupsView', provider));

  context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.refreshSavedGroups', () => provider.refresh()));

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.openSavedTab', async (input?: unknown) => {
      const tab = extractTabEntryFromInput(input);
      if (!tab) {
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(tab.uri));
        await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
      } catch {
        vscode.window.showWarningMessage(`タブを開けませんでした: ${tab.previewLabel}`);
      }
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
        tabs,
        createdAt: new Date().toISOString()
      };

      const savedGroups = readSavedGroups(context);
      savedGroups.unshift(savedGroup);
      await context.globalState.update(STORAGE_KEY, savedGroups);

      provider.refresh();
      vscode.window.showInformationMessage(`グループ「${savedGroup.name}」を保存しました（${savedGroup.tabs.length}タブ）。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.addSelectionToExistingGroup', async (...args: unknown[]) => {
      const tabs = collectTabsFromContext(args);
      if (tabs.length === 0) {
        vscode.window.showWarningMessage('タブが取得できませんでした。タブを選択してから実行してください。');
        return;
      }

      const selectedGroup = await resolveGroupSelection(context);
      if (!selectedGroup) {
        return;
      }

      const mergedTabs = dedupeByUri([...selectedGroup.tabs, ...tabs]);
      const addedCount = mergedTabs.length - selectedGroup.tabs.length;
      if (addedCount === 0) {
        vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」に追加できる新規タブはありませんでした。`);
        return;
      }

      const updatedGroups = readSavedGroups(context).map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              tabs: mergedTabs
            }
          : group
      );
      await context.globalState.update(STORAGE_KEY, updatedGroups);
      provider.refresh();
      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」へ ${addedCount} タブ追加しました。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.restoreGroup', async (input?: unknown) => {
      const selectedGroup = await resolveGroupSelection(context, input);
      if (!selectedGroup) {
        return;
      }

      const targetViewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
      let restoredCount = 0;
      for (const savedTab of selectedGroup.tabs) {
        try {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(savedTab.uri));
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: true,
            viewColumn: targetViewColumn
          });
          restoredCount += 1;
        } catch {
          vscode.window.showWarningMessage(`復元できないタブがあります: ${savedTab.previewLabel}`);
        }
      }

      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」を復元しました（${restoredCount}/${selectedGroup.tabs.length}）。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.closeGroupTabs', async (input?: unknown) => {
      const selectedGroup = await resolveGroupSelection(context, input);
      if (!selectedGroup) {
        return;
      }

      const uriSet = new Set<string>(selectedGroup.tabs.map((tab) => tab.uri));
      const closableTabs = vscode.window.tabGroups.activeTabGroup.tabs
        .filter((tab): tab is vscode.Tab & { input: vscode.TabInputText } => tab.input instanceof vscode.TabInputText)
        .filter((tab) => uriSet.has(tab.input.uri.toString()));

      if (closableTabs.length === 0) {
        vscode.window.showInformationMessage('現在開かれている該当タブはありません。');
        return;
      }

      await vscode.window.tabGroups.close(closableTabs, true);
      vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」のタブを閉じました（${closableTabs.length}件）。`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tabgroupExtra.deleteGroup', async (input?: unknown) => {
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
  const tabCandidates: TabLike[] = [];

  const visit = (value: unknown): void => {
    if (!value) {
      return;
    }

    if (isTabLike(value)) {
      tabCandidates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry));
      return;
    }

    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if ('tab' in candidate) {
        visit(candidate.tab);
      }
      if ('tabs' in candidate) {
        visit(candidate.tabs);
      }
      if ('selectedTabs' in candidate) {
        visit(candidate.selectedTabs);
      }
    }
  };

  args.forEach((arg) => visit(arg));

  const mappedTabs = tabCandidates
    .filter((tab): tab is TabLike & { input: vscode.TabInputText } => tab.input instanceof vscode.TabInputText)
    .map((tab) => ({
      uri: tab.input.uri.toString(),
      previewLabel: tab.label
    }));

  return dedupeByUri(mappedTabs);
}

function isTabLike(value: unknown): value is TabLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { label?: unknown; input?: unknown };
  return typeof candidate.label === 'string' && candidate.input !== undefined;
}

function dedupeByUri(entries: SavedTabEntry[]): SavedTabEntry[] {
  const map = new Map<string, SavedTabEntry>();
  for (const entry of entries) {
    map.set(entry.uri, entry);
  }

  return [...map.values()];
}

function compactPath(rawUri: string): string {
  try {
    const parsed = vscode.Uri.parse(rawUri);
    const base = path.basename(parsed.fsPath || parsed.path || rawUri);
    const dir = path.dirname(parsed.fsPath || parsed.path || rawUri);
    return `${base} — ${dir}`;
  } catch {
    return rawUri;
  }
}

async function resolveGroupSelection(
  context: vscode.ExtensionContext,
  input?: unknown
): Promise<SavedTabGroup | undefined> {
  const groupFromInput = extractGroupFromInput(input);
  if (groupFromInput) {
    return groupFromInput;
  }

  const savedGroups = readSavedGroups(context);
  if (savedGroups.length === 0) {
    vscode.window.showInformationMessage('保存済みグループはまだありません。');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    savedGroups.map((group) => ({
      label: `${COLOR_BADGE[group.color]} ${group.name}`,
      description: `${group.tabs.length} tabs`,
      detail: group.tabs.map((tab) => tab.previewLabel).join(' / '),
      group
    })),
    { placeHolder: '操作するグループを選択してください' }
  );

  return picked?.group;
}

function extractGroupFromInput(input: unknown): SavedTabGroup | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if (input instanceof SavedGroupItem) {
    return input.group;
  }

  if (input instanceof SavedTabEntryItem) {
    return input.group;
  }

  const candidate = input as Partial<SavedTabGroup>;
  if (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.color === 'string' &&
    Array.isArray(candidate.tabs) &&
    typeof candidate.createdAt === 'string'
  ) {
    return candidate as SavedTabGroup;
  }

  return undefined;
}

function extractTabEntryFromInput(input: unknown): SavedTabEntry | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if (input instanceof SavedTabEntryItem) {
    return input.tab;
  }

  const candidate = input as Partial<SavedTabEntry>;
  if (typeof candidate.uri === 'string' && typeof candidate.previewLabel === 'string') {
    return candidate as SavedTabEntry;
  }

  return undefined;
}

function readSavedGroups(context: vscode.ExtensionContext): SavedTabGroup[] {
  const saved = context.globalState.get<SavedTabGroup[]>(STORAGE_KEY);
  return Array.isArray(saved) ? saved : [];
}

export function deactivate(): void {
  // no-op
}
