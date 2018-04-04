const Extension = imports.misc.extensionUtils.extensions['paperwm@hedning:matrix.org']
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const AltTab = imports.ui.altTab;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
let WindowManager = imports.ui.windowManager;
const Scratch = Extension.imports.scratch;
const Tiling = Extension.imports.tiling;
const utils = Extension.imports.utils;
const debug = utils.debug;
var TopBar = Extension.imports.topbar;

WindowManager.WindowManager.prototype._previewWorkspace = function(from, to, callback) {

    TopBar.updateWorkspaceIndicator(to.index());

    let windows = global.get_window_actors();

    let xDest = 0, yDest = global.screen_height;

    let switchData = {};
    this._switchData = switchData;
    switchData.inGroup = new Clutter.Actor();
    switchData.outGroup = new Clutter.Actor();
    switchData.movingWindowBin = new Clutter.Actor();
    switchData.windows = [];

    let wgroup = global.window_group;
    wgroup.add_actor(switchData.inGroup);
    wgroup.add_actor(switchData.outGroup);
    wgroup.add_actor(switchData.movingWindowBin);

    for (let i = 0; i < windows.length; i++) {
        let actor = windows[i];
        let window = actor.get_meta_window();

        if (!window.showing_on_its_workspace())
            continue;

        if (window.is_on_all_workspaces())
            continue;

        let record = { window: actor,
                       parent: actor.get_parent() };

        if (this._movingWindow && window == this._movingWindow) {
            switchData.movingWindow = record;
            switchData.windows.push(switchData.movingWindow);
            actor.reparent(switchData.movingWindowBin);
        } else if (window.get_workspace() == from) {
            switchData.windows.push(record);
            actor.reparent(switchData.outGroup);
        } else if (window.get_workspace() == to) {
            switchData.windows.push(record);
            actor.reparent(switchData.inGroup);
            actor.show();
        }
    }

    switchData.inGroup.set_position(-xDest, global.screen_height);
    switchData.inGroup.raise_top();

    switchData.movingWindowBin.raise_top();

    Tweener.addTween(switchData.outGroup,
                     { x: xDest,
                       y: yDest,
                       time: 0.25,
                       transition: 'easeInOutQuad',
                     });
    Tweener.addTween(switchData.inGroup,
                     { x: 0,
                       y: 0,
                       time: 0.25,
                       transition: 'easeInOutQuad',
                       onComplete: callback,
                     });
}


WindowManager.WindowManager.prototype._previewWorkspaceDone = function() {
    let switchData = this._switchData;
    if (!switchData)
        return;
    this._switchData = null;

    for (let i = 0; i < switchData.windows.length; i++) {
        let w = switchData.windows[i];
        if (w.window.is_destroyed()) // Window gone
            continue;
        if (w.window.get_parent() == switchData.outGroup) {
            w.window.reparent(w.parent);
            w.window.hide();
        } else
            w.window.reparent(w.parent);
    }
    Tweener.removeTweens(switchData.inGroup);
    Tweener.removeTweens(switchData.outGroup);
    switchData.inGroup.destroy();
    switchData.outGroup.destroy();
    switchData.movingWindowBin.destroy();

    if (this._movingWindow)
        this._movingWindow = null;
}

var LiveAltTab = Lang.Class({
    Name: 'LiveAltTab',
    Extends: AltTab.WindowSwitcherPopup,

    _getWindowList: function () {
        let tabList = global.display.get_tab_list(Meta.TabList.NORMAL_ALL,
                                                  global.screen.get_active_workspace());
        if (Scratch.isScratchActive()) {
            return Scratch.getScratchWindows();
        } else {
            return tabList;
        }
    },

    _keyPressHandler: function(keysym, action) {
        // After the first super-tab the action we get is apparently
        // SWITCH_APPLICATIONS so we need to case on those too.
        let paperActions = Extension.imports.extension.paperActions;
        switch(action) {
        case Meta.KeyBindingAction.SWITCH_APPLICATIONS:
            action = Meta.KeyBindingAction.SWITCH_WINDOWS;
            break;
        case Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD:
            action = Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD;
            break;
        case paperActions.idOf('live-alt-tab'):
            action = Meta.KeyBindingAction.SWITCH_WINDOWS;
            break;
            ;;
        case paperActions.idOf('live-alt-tab-backward'):
            action = Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD;
            break;
            ;;
        }
        return this.parent(keysym, action)
    },

    _select: function(num) {

        if (this.switchedWorkspace) {
            Main.wm._previewWorkspaceDone(global.window_manager);
            this.switchedWorkspace = false;
        }

        let from = this._switcherList.windows[this._selectedIndex];
        let to = this._switcherList.windows[num];

        this.clone && this.clone.destroy();
        // Show pseudo focused scratch windows
        if (Scratch.isScratchWindow(to)) {
            let actor = to.get_compositor_private();
            let clone = new Clutter.Clone({source: actor});
            clone.position = actor.position;
            this.clone = clone;
            Main.uiGroup.add_child(clone);
            // Raise the switcherpopup to the top
            Main.uiGroup.set_child_above_sibling(this.actor, clone);
        }

        let fromIndex = from.get_workspace().workspace_index;
        let toIndex = to.get_workspace().workspace_index;
        if (toIndex !== fromIndex) {
            Main.wm._previewWorkspace(from.get_workspace(),
                                      to.get_workspace());
            this.switchedWorkspace = true;
        }

        let space = Tiling.spaces.spaceOfWindow(to);
        Tiling.ensure_viewport(space, to);
        this._selectedIndex = num;
        this._switcherList.highlight(num);
    },

    _finish: function() {
        this.parent();

        this.was_accepted = true;
        Main.wm._previewWorkspaceDone(global.window_manager);
    },

    _itemEnteredHandler: function() {
        // The item-enter (mouse hover) event is triggered even after a item is
        // accepted. This can cause _select to run on the item below the pointer
        // ensuring the wrong window.
        if(!this.was_accepted) {
            this.parent.apply(this, arguments);
        }
    },

    _onDestroy: function() {
        debug('#preview', 'onDestroy', this.was_accepted);
        if(!this.was_accepted) {
            // Select the starting window
            this._select(0);
            Main.wm._previewWorkspaceDone(global.window_manager);
        }
        this.clone && this.clone.destroy();
        this.parent();
    }
})


function liveAltTab(display, screen, meta_window, binding) {
    let tabPopup = new LiveAltTab();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask());
}
