/* global React */
(function(){
  const routes = {
    '/': () => window.Pages.LoginPage,
    '/panel': () => window.Pages.PanelPage,
    '/bls': () => window.Pages.BLListPage,
    '/admin': () => window.Pages.AdminUsersPage,
    // '/bl/:id' lo maneja BLDetailPage dinámicamente
  };
  function getComponentForPath(path) {
    if (/^\/bl\//.test(path)) return window.Pages.BLDetailPage;
    const factory = routes[path] || routes['/'];
    return factory();
  }
  window.Router = window.Router || {};
  window.Router.getPath = () => location.hash.slice(1) || '/';
  window.Router.getComponent = () => getComponentForPath(window.Router.getPath());
  window.Router.navigate = (path) => { location.hash = path; };
})();