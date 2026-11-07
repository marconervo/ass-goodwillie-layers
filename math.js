window.addEventListener('DOMContentLoaded', () => {
  const notes = document.querySelector('.notes');
  if (!notes) return;

  renderMathInElement(notes, {
    delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
    throwOnError: true
  });
});
