/**
 * Compatibility entry point. Search responsibilities live in the controller,
 * injected use case, pure model, and DOM view adapter.
 */
export {
    clearGlobalSearch,
    handleSearchKeydown,
    initSearch,
    performGlobalSearch,
    performSearch,
    setSearchFilter,
} from './controllers/searchController.js';
