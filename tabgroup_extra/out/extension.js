"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const path = require("path");
const STORAGE_KEY = 'tabgroupExtra.savedGroups';
const COLOR_ITEMS = [
    { label: 'Grey', color: 'grey' },
    { label: 'Blue', color: 'blue' },
    { label: 'Green', color: 'green' },
    { label: 'Yellow', color: 'yellow' },
    { label: 'Orange', color: 'orange' },
    { label: 'Red', color: 'red' },
    { label: 'Purple', color: 'purple' },
    { label: 'Pink', color: 'pink' }
];
const COLOR_BADGE = {
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
    constructor(group) {
        super(`${COLOR_BADGE[group.color]} ${group.name} (${group.tabs.length})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.group = group;
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
    constructor(group, tab) {
        super(tab.previewLabel, vscode.TreeItemCollapsibleState.None);
        this.group = group;
        this.tab = tab;
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
class SavedGroupsProvider {
    constructor(context) {
        this.context = context;
        this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    }
    refresh() {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return readSavedGroups(this.context).map((group) => new SavedGroupItem(group));
        }
        if (element instanceof SavedGroupItem) {
            return element.group.tabs.map((tab) => new SavedTabEntryItem(element.group, tab));
        }
        return [];
    }
}
function activate(context) {
    const provider = new SavedGroupsProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('tabgroupExtra.savedGroupsView', provider));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.refreshSavedGroups', () => provider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.openSavedTab', async (input) => {
        const tab = extractTabEntryFromInput(input);
        if (!tab) {
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(tab.uri));
            await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
        }
        catch {
            vscode.window.showWarningMessage(`タブを開けませんでした: ${tab.previewLabel}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.createGroupFromSelection', async (...args) => {
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
        const selectedColorItem = await vscode.window.showQuickPick(COLOR_ITEMS.map((colorItem) => ({
            label: colorItem.label,
            description: colorItem.color,
            color: colorItem.color
        })), { placeHolder: 'グループの色を選択してください' });
        if (!selectedColorItem) {
            return;
        }
        const savedGroup = {
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
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.addSelectionToExistingGroup', async (...args) => {
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
        const updatedGroups = readSavedGroups(context).map((group) => group.id === selectedGroup.id
            ? {
                ...group,
                tabs: mergedTabs
            }
            : group);
        await context.globalState.update(STORAGE_KEY, updatedGroups);
        provider.refresh();
        vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」へ ${addedCount} タブ追加しました。`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.restoreGroup', async (input) => {
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
            }
            catch {
                vscode.window.showWarningMessage(`復元できないタブがあります: ${savedTab.previewLabel}`);
            }
        }
        vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」を復元しました（${restoredCount}/${selectedGroup.tabs.length}）。`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.closeGroupTabs', async (input) => {
        const selectedGroup = await resolveGroupSelection(context, input);
        if (!selectedGroup) {
            return;
        }
        const uriSet = new Set(selectedGroup.tabs.map((tab) => tab.uri));
        const closableTabs = vscode.window.tabGroups.activeTabGroup.tabs
            .filter((tab) => tab.input instanceof vscode.TabInputText)
            .filter((tab) => uriSet.has(tab.input.uri.toString()));
        if (closableTabs.length === 0) {
            vscode.window.showInformationMessage('現在開かれている該当タブはありません。');
            return;
        }
        await vscode.window.tabGroups.close(closableTabs, true);
        vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」のタブを閉じました（${closableTabs.length}件）。`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tabgroupExtra.deleteGroup', async (input) => {
        const selectedGroup = await resolveGroupSelection(context, input);
        if (!selectedGroup) {
            return;
        }
        const confirmation = await vscode.window.showWarningMessage(`グループ「${selectedGroup.name}」を削除します。`, { modal: true }, '削除する');
        if (confirmation !== '削除する') {
            return;
        }
        const remaining = readSavedGroups(context).filter((group) => group.id !== selectedGroup.id);
        await context.globalState.update(STORAGE_KEY, remaining);
        provider.refresh();
        vscode.window.showInformationMessage(`グループ「${selectedGroup.name}」を削除しました。`);
    }));
}
function collectTabsFromContext(args) {
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
function normalizeTabsFromArgs(args) {
    const tabCandidates = [];
    const visit = (value) => {
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
            const candidate = value;
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
        .filter((tab) => tab.input instanceof vscode.TabInputText)
        .map((tab) => ({
        uri: tab.input.uri.toString(),
        previewLabel: tab.label
    }));
    return dedupeByUri(mappedTabs);
}
function isTabLike(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return typeof candidate.label === 'string' && candidate.input !== undefined;
}
function dedupeByUri(entries) {
    const map = new Map();
    for (const entry of entries) {
        map.set(entry.uri, entry);
    }
    return [...map.values()];
}
function compactPath(rawUri) {
    try {
        const parsed = vscode.Uri.parse(rawUri);
        const base = path.basename(parsed.fsPath || parsed.path || rawUri);
        const dir = path.dirname(parsed.fsPath || parsed.path || rawUri);
        return `${base} — ${dir}`;
    }
    catch {
        return rawUri;
    }
}
async function resolveGroupSelection(context, input) {
    const groupFromInput = extractGroupFromInput(input);
    if (groupFromInput) {
        return groupFromInput;
    }
    const savedGroups = readSavedGroups(context);
    if (savedGroups.length === 0) {
        vscode.window.showInformationMessage('保存済みグループはまだありません。');
        return undefined;
    }
    const picked = await vscode.window.showQuickPick(savedGroups.map((group) => ({
        label: `${COLOR_BADGE[group.color]} ${group.name}`,
        description: `${group.tabs.length} tabs`,
        detail: group.tabs.map((tab) => tab.previewLabel).join(' / '),
        group
    })), { placeHolder: '操作するグループを選択してください' });
    return picked?.group;
}
function extractGroupFromInput(input) {
    if (!input || typeof input !== 'object') {
        return undefined;
    }
    if (input instanceof SavedGroupItem) {
        return input.group;
    }
    if (input instanceof SavedTabEntryItem) {
        return input.group;
    }
    const candidate = input;
    if (typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.color === 'string' &&
        Array.isArray(candidate.tabs) &&
        typeof candidate.createdAt === 'string') {
        return candidate;
    }
    return undefined;
}
function extractTabEntryFromInput(input) {
    if (!input || typeof input !== 'object') {
        return undefined;
    }
    if (input instanceof SavedTabEntryItem) {
        return input.tab;
    }
    const candidate = input;
    if (typeof candidate.uri === 'string' && typeof candidate.previewLabel === 'string') {
        return candidate;
    }
    return undefined;
}
function readSavedGroups(context) {
    const saved = context.globalState.get(STORAGE_KEY);
    return Array.isArray(saved) ? saved : [];
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map