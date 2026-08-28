(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const assistant = document.getElementById('view-assistant');
    if (assistant) assistant.classList.add('admin-persistent-assistant');
  });
})();
