try {
  if (localStorage.getItem('cortexis-theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark'
  }
} catch (_) {
  // ignore private mode / blocked storage
}
