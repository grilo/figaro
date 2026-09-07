/** Pane selection belongs to a tab; the user's splitter width is shared. */
export function switchRightPaneState(state, nextId, visibleMode) {
    return {
        activeId: nextId,
        selections: state.activeId == null ? state.selections
            : { ...state.selections, [state.activeId]: visibleMode || null },
    };
}
