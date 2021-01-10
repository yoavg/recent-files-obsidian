import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  ItemView,
  WorkspaceLeaf,
  EventRef,
  TFile,
  addIcon,
} from "obsidian";

interface File {
  path: string;
  basename: string;
}

interface RecentFilesData {
  recentFiles: File[];
  omittedPaths: string[];
  maxLength: number;
}

const DEFAULT_DATA: RecentFilesData = {
  recentFiles: [],
  omittedPaths: [],
  maxLength: 5,
};

const RecentFilesListViewType = "recent-files";

class RecentFilesListView extends ItemView {
  private listeners: EventRef[];
  private plugin: RecentFilesPlugin;
  private data: RecentFilesData;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: RecentFilesPlugin,
    data: RecentFilesData
  ) {
    super(leaf);

    this.plugin = plugin;
    this.data = data;
  }

  getViewType(): string {
    return RecentFilesListViewType;
  }

  getDisplayText(): string {
    return "Recent Files";
  }

  getIcon(): string {
    return "clock";
  }

  async onOpen(): Promise<void> {
    this.listeners = [this.app.workspace.on("file-open", this.update)];
  }

  async onClose() {
    this.listeners.forEach((listener) => this.app.workspace.offref(listener));
  }

  private readonly updateData = (file: TFile) => {
    this.data.recentFiles = this.data.recentFiles.filter(
      (currFile) => currFile.basename !== file.basename
    );
    this.data.recentFiles.splice(0, 0, {
      basename: file.basename,
      path: file.path,
    });

    const toRemove = this.data.recentFiles.length - this.data.maxLength;
    if (toRemove > 0) {
      this.data.recentFiles.splice(
        this.data.recentFiles.length - toRemove,
        toRemove
      );
    }

    this.plugin.saveData();
  };

  private readonly update = (openedFile: TFile) => {
    if (!this.plugin.shouldAddFile(openedFile)) {
      return;
    }

    this.updateData(openedFile);
    this.redraw();
  };

  public readonly redraw = () => {
    const openFile = this.app.workspace.getActiveFile();

    const rootEl = document.createElement("div");
    rootEl.addClasses(["nav-folder", "mod-root"]);

    const childrenEl = rootEl.createDiv({ cls: "nav-folder-children" });

    this.data.recentFiles.forEach((currentFile) => {
      const navFile = childrenEl.createDiv({ cls: "nav-file" });
      const navFileTitle = navFile.createDiv({ cls: "nav-file-title" });

      if (currentFile.basename === openFile.basename) {
        navFileTitle.addClass("is-active");
      }

      navFileTitle.createDiv({
        cls: "nav-file-title-content",
        text: currentFile.basename,
      });

      navFile.onClickEvent(this.handleFileClick);
    });

    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    contentEl.appendChild(rootEl);
  };

  private readonly handleFileClick = (event: MouseEvent) => {
    if (event.target instanceof HTMLDivElement) {
      const targetFileName = event.target.hasClass("nav-file-title-content")
        ? event.target.getText()
        : event.target.children[0].getText();

      const targetFile = this.app.vault
        .getFiles()
        .find((file) => file.basename === targetFileName);

      if (targetFile) {
        this.app.workspace.getMostRecentLeaf().openFile(targetFile);
      }
    }
  };
}

export default class RecentFilesPlugin extends Plugin {
  data: RecentFilesData;
  view: RecentFilesListView;

  async onload() {
    console.log("loading plugin");

    await this.loadData();

    addIcon("clock", clockIcon);

    this.registerView(
      RecentFilesListViewType,
      (leaf) => (this.view = new RecentFilesListView(leaf, this, this.data))
    );

    this.addRibbonIcon("clock", "Recent Files", this.initView);

    this.addSettingTab(new RecentFilesSettingTab(this.app, this));
  }

  async loadData() {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
  }

  async saveData() {
    await super.saveData(this.data);
  }

  private initView = () => {
    if (this.app.workspace.getLeavesOfType(RecentFilesListViewType).length) {
      return;
    }

    this.app.workspace.getLeftLeaf(false).setViewState({
      type: RecentFilesListViewType,
      active: true,
    });
  };

  public readonly pruneOmittedFiles = () => {
    this.data.recentFiles = this.data.recentFiles.filter(this.shouldAddFile);
    this.saveData();
  };

  public readonly shouldAddFile = (file: File): boolean =>
    this.data.omittedPaths
      .filter((path) => path.length > 0) // Ignore empty lines
      .find((omittedPath) => file.path.startsWith(omittedPath)) === undefined;
}

class RecentFilesSettingTab extends PluginSettingTab {
  plugin: RecentFilesPlugin;

  constructor(app: App, plugin: RecentFilesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Recent Files List" });

    new Setting(containerEl)
      .setName("Omitted paths")
      .setDesc("File path prefixes to ignore. One path per line.")
      .addTextArea((textArea) =>
        textArea
          .setPlaceholder("daily/")
          .setValue(this.plugin.data.omittedPaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.data.omittedPaths = value.split("\n");
            this.plugin.pruneOmittedFiles();
            this.plugin.view.redraw();
          })
      );

    const div = containerEl.createEl("div", {
      cls: "recent-files-donation",
    });

    const donateText = document.createElement("p");
    donateText.appendText(
      "If this plugin adds value for you and you would like to help support " +
        "continued development, please use the buttons below:"
    );
    div.appendChild(donateText);

    div.appendChild(
      createDonateButton(
        "https://www.buymeacoffee.com/tgrosinger",
        "Buy Me a Coffee",
        "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
      )
    );

    div.appendChild(
      createDonateButton(
        "https://paypal.me/tgrosinger",
        "PayPal.Me",
        "https://www.paypalobjects.com/webstatic/en_US/i/buttons/PP_logo_h_150x38.png"
      )
    );
  }
}

const createDonateButton = (
  link: string,
  name: string,
  imgURL: string
): HTMLElement => {
  const a = document.createElement("a");
  a.setAttribute("href", link);
  a.addClass("recent-files-donate-button");

  const img = document.createElement("img");
  img.setAttribute("width", "150px");
  img.setAttribute("src", imgURL);
  img.setText(name);

  a.appendChild(img);
  return a;
};

const clockIcon = `
<svg fill="currentColor" stroke="currentColor" version="1.1" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path d="m368 394.67c-4.0977 0-8.1914-1.5586-11.309-4.6953l-112-112c-3.0078-3.0078-4.6914-7.082-4.6914-11.305v-149.34c0-8.832 7.168-16 16-16s16 7.168 16 16v142.7l107.31 107.31c6.25 6.25 6.25 16.383 0 22.633-3.1172 3.1367-7.2109 4.6953-11.309 4.6953z"/>
  <ellipse cx="259.25" cy="258.17" rx="245.77" ry="244.68" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="25"/>
</svg>`;
