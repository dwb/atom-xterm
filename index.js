'use babel';

import path from 'path';
import { CompositeDisposable, Emitter } from 'event-kit';
import consistentEnv from 'consistent-env';
import { keystrokeForKeyboardEvent } from 'atom-keymap/lib/helpers';
import TermView from './lib/term-view';
import ListView from './lib/list-view';
import store from './lib/store';

const capitalize = str => str[0].toUpperCase() + str.slice(1).toLowerCase();

const ENV = consistentEnv();

function getColors(colors) {
  const {
    normalBlack,
    normalRed,
    normalGreen,
    normalYellow,
    normalBlue,
    normalPurple,
    normalCyan,
    normalWhite,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightPurple,
    brightCyan,
    brightWhite,
    background,
    foreground,
  } = colors;
  return [
    normalBlack,
    normalRed,
    normalGreen,
    normalYellow,
    normalBlue,
    normalPurple,
    normalCyan,
    normalWhite,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightPurple,
    brightCyan,
    brightWhite,
    background,
    foreground,
  ].map(color => (color.toHexString == null ? color : color.toHexString()));
}

function getFirstEditorPath() {
  const editors = atom.workspace.getTextEditors();
  if (editors.length > 0) {
    return editors[0].getPath();
  }
  return undefined;
}

function createColorsStyleSheet(colors) {
  const title = 'xterm-colors';
  let ssEl = document.querySelector(`style[title="${title}"]`);
  if (ssEl != null) {
    ssEl.parentElement.removeChild(ssEl);
  }
  const stylePrefix = '.xterm .terminal';
  const styles = [];
  const addStyle = s => styles.push(stylePrefix + s);

  let i = 0;
  for (const c of Array.from(colors.slice(0, 16))) {
    addStyle(` .xterm-color-${i} { color: ${c}; }`);
    addStyle(` .xterm-bg-color-${i} { background-color: ${c}; }`);
    i += 1;
  }
  addStyle(` { background: ${colors[16]}; color: ${colors[17]}; }`);
  addStyle(
    ` .xterm-viewport { background: ${colors[16]}; color: ${colors[17]}; }`,
  );

  ssEl = document.createElement('style');
  ssEl.title = title;
  ssEl.innerHTML = styles.join('\n');
  return document.querySelector('head').appendChild(ssEl);
}

const config = {
  autoRunCommand: {
    type: 'string',
    default: '',
  },
  titleTemplate: {
    type: 'string',
    default: 'Terminal ({{ bashName }})',
  },
  fontFamily: {
    type: 'string',
    default: '',
  },
  fontSize: {
    type: 'string',
    default: '',
  },
  ignoreKeystrokes: {
    description:
      'Keystrokes (in Atom keymap format, comma-separated) which should be ignored by the terminal.',
    type: 'array',
    default: [],
    items: {
      type: 'string',
    },
  },
  colors: {
    type: 'object',
    properties: {
      normalBlack: {
        type: 'color',
        default: '#2e3436',
      },
      normalRed: {
        type: 'color',
        default: '#cc0000',
      },
      normalGreen: {
        type: 'color',
        default: '#4e9a06',
      },
      normalYellow: {
        type: 'color',
        default: '#c4a000',
      },
      normalBlue: {
        type: 'color',
        default: '#3465a4',
      },
      normalPurple: {
        type: 'color',
        default: '#75507b',
      },
      normalCyan: {
        type: 'color',
        default: '#06989a',
      },
      normalWhite: {
        type: 'color',
        default: '#d3d7cf',
      },
      brightBlack: {
        type: 'color',
        default: '#555753',
      },
      brightRed: {
        type: 'color',
        default: '#ef2929',
      },
      brightGreen: {
        type: 'color',
        default: '#8ae234',
      },
      brightYellow: {
        type: 'color',
        default: '#fce94f',
      },
      brightBlue: {
        type: 'color',
        default: '#729fcf',
      },
      brightPurple: {
        type: 'color',
        default: '#ad7fa8',
      },
      brightCyan: {
        type: 'color',
        default: '#34e2e2',
      },
      brightWhite: {
        type: 'color',
        default: '#eeeeec',
      },
      background: {
        type: 'color',
        default: '#000000',
      },
      foreground: {
        type: 'color',
        default: '#f0f0f0',
      },
    },
  },
  scrollback: {
    type: 'integer',
    default: 1000,
  },
  cursorBlink: {
    type: 'boolean',
    default: true,
  },
  shellOverride: {
    type: 'string',
    default: '',
  },
  shellArguments: {
    type: 'array',
    default: (({ SHELL, HOME }) => {
      switch (path.basename(SHELL && SHELL.toLowerCase())) {
        case 'bash':
          return ['--init-file', path.join(HOME, '.bash_profile')];
        case 'zsh':
          return ['-l'];
        default:
          return [];
      }
    })(ENV),
  },
  openPanesInSameSplit: {
    type: 'boolean',
    default: false,
  },
};

export default {
  termViews: [],
  focusedTerminal: false,
  emitter: new Emitter(),
  config,
  disposables: null,

  activate(state) {
    this.state = state;
    this.disposables = new CompositeDisposable();

    ['up', 'right', 'down', 'left'].forEach(direction =>
      this.disposables.add(
        atom.commands.add(
          'atom-workspace',
          `xterm:open-split-${direction}`,
          this.splitTerm.bind(this, direction),
        ),
      ),
    );

    this.disposables.add(
      atom.config.observe('xterm.colors', cs =>
        createColorsStyleSheet(getColors(cs)),
      ),
    );

    this.disposables.add(
      atom.config.observe('xterm.ignoreKeystrokes', ks => {
        this.ignoreTerminalKeystrokes = new Set(ks);
      }),
    );

    this.disposables.add(
      atom.commands.add(
        'atom-workspace',
        'xterm:open',
        this.newTerm.bind(this),
      ),
    );
    this.disposables.add(
      atom.commands.add(
        'atom-workspace',
        'xterm:pipe-path',
        this.pipeTerm.bind(this, 'path'),
      ),
    );
    this.disposables.add(
      atom.commands.add(
        'atom-workspace',
        'xterm:pipe-selection',
        this.pipeTerm.bind(this, 'selection'),
      ),
    );
    this.disposables.add(
      atom.commands.add('.xterm', 'core:copy', e => {
        e.stopPropagation();
        e.preventDefault();
        this.copyTerminalSelection();
      }),
    );
    atom.commands.add('.xterm', 'xterm:clear-scrollback', e => {
      e.stopPropagation();
      e.preventDefault();
      this.clearActiveTerm();
    });

    this.disposables.add(
      atom.workspace.addOpener(uri => {
        if (uri === 'atom://xterm-term-view') {
          this.newTerm();
        }
      }),
    );

    this.disposables.add(
      atom.workspace.observeActivePaneItem(item => {
        if (item instanceof TermView) {
          item.focusTerm();
        }
      }),
    );

    this.disposables.add(
      atom.packages.onDidActivatePackage(pkg => {
        if (pkg.name !== 'tree-view') {
          return;
        }
        const node = new ListView();
        const treeView = pkg.mainModule.treeView.element;
        treeView.insertBefore(node, treeView.firstChild);
      }),
    );
  },

  provideServiceV1_0_0() {
    return {
      getTerminals: this.getTerminals.bind(this),
      onTerm: this.onTerm.bind(this),
      newTerm: this.newTerm.bind(this),
    };
  },

  getTerminals() {
    return store.getState().terminals.map(t => t.term);
  },

  onTerm(callback) {
    return this.emitter.on('term', callback);
  },

  handleTerminalKey(e) {
    const ks = this.ignoreTerminalKeystrokes;
    if (ks == null || ks.size === 0) return true;
    const keystroke = keystrokeForKeyboardEvent(e);
    if (ks.has(keystroke)) {
      return false;
    }
    return true;
  },

  newTerm(forkPTY = true, rows = 30, cols = 80, title = 'tty') {
    const termView = this.createTermView(forkPTY, rows, cols, title);
    const pane = atom.workspace.getActivePane();
    termView.attachToPane(pane);
    const item = pane.addItem(termView);
    pane.activateItem(item);
    return termView;
  },

  createTermView(forkPTY = true, rows = 30, cols = 80, title = 'tty') {
    const opts = {
      runCommand: atom.config.get('xterm.autoRunCommand'),
      shellOverride: atom.config.get('xterm.shellOverride'),
      shellArguments: atom.config.get('xterm.shellArguments'),
      titleTemplate: atom.config.get('xterm.titleTemplate'),
      cursorBlink: atom.config.get('xterm.cursorBlink'),
      fontFamily: atom.config.get('xterm.fontFamily'),
      fontSize: atom.config.get('xterm.fontSize'),
      forkPTY,
      rows,
      cols,
      keyHandler: this.handleTerminalKey.bind(this),
    };

    if (opts.shellOverride) {
      opts.shell = opts.shellOverride;
    } else {
      opts.shell = ENV.SHELL || 'bash';
    }

    opts.cwd =
      opts.cwd ||
      atom.project.getPaths()[0] ||
      getFirstEditorPath() ||
      ENV.HOME;

    const termView = new TermView(opts);
    const model = store.addTerminal({
      local: !!forkPTY,
      term: termView,
      title,
    }).terminal;
    const { id } = model;
    termView.id = id;

    termView.onExit(() => this.handleRemoveTerm(termView));

    termView.onDidChangeTitle(() => {
      let newTitle = null;
      if (forkPTY) {
        newTitle = termView.getTitle();
      } else {
        newTitle = `${title}-${termView.getTitle()}`;
      }
      store.updateTerminal({ id: termView.id, title: newTitle });
    });

    termView.onFocus(() => {
      this.focusedTerminal = termView;
      store.setActiveTerminal(termView);
    });

    termView.onBlur(() => {
      store.setActiveTerminal(null);
    });

    if (typeof this.termViews.push === 'function') {
      this.termViews.push(termView);
    }
    process.nextTick(() => this.emitter.emit('term', termView));
    return termView;
  },

  splitTerm(dir) {
    let pane;
    const openPanesInSameSplit = atom.config.get('xterm.openPanesInSameSplit');
    const termView = this.createTermView();
    const direction = capitalize(dir);
    const activePane = atom.workspace.getActivePane();

    const splitter = () => {
      pane = activePane[`split${direction}`]({ items: [termView] });
      activePane.termSplits[direction] = pane;
    };

    if (!activePane.termSplits) {
      activePane.termSplits = {};
    }
    if (openPanesInSameSplit) {
      if (
        activePane.termSplits[direction] &&
        activePane.termSplits[direction].items.length > 0
      ) {
        pane = activePane.termSplits[direction];
        const item = pane.addItem(termView);
        pane.activateItem(item);
      } else {
        splitter();
      }
    } else {
      splitter();
    }

    termView.attachToPane(pane);
  },

  pipeTerm(action) {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }
    const stream = (() => {
      switch (action) {
        case 'path':
          return editor.getBuffer().file.path;
        case 'selection':
          return editor.getSelectedText();
        default:
          return null;
      }
    })();

    if (stream && this.focusedTerminal) {
      this.focusedTerminal.input(stream.trim());
      this.focusedTerminal.focusAndActivatePane();
    }
  },

  copyTerminalSelection() {
    if (this.focusedTerminal == null) return;
    atom.clipboard.write(this.focusedTerminal.getSelection());
  },

  clearActiveTerm() {
    if (this.focusedTerminal == null) return;
    this.focusedTerminal.clear();
  },

  handleRemoveTerm(termView) {
    store.removeTerminal(termView);
    this.termViews.splice(this.termViews.indexOf(termView), 1);
  },

  deactivate() {
    this.termViews.forEach(view => view.exit());
    this.termViews = [];
    this.disposables.dispose();
  },

  deserializeTermView() {
    return this.createTermView();
  },
};
