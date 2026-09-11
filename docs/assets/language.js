// Preserve both explicit anchors and the section reached by scrolling.
function currentSection() {
  const sections = [...document.querySelectorAll('main [id]')]
    .filter(node => /^(SECTION|ARTICLE|DETAILS|HEADER)$/.test(node.tagName));
  const current = sections.filter(node => node.getBoundingClientRect().top <= 160).at(-1);
  return current ? `#${current.id}` : location.hash;
}
document.querySelectorAll('[data-language]').forEach(link => {
  const update = () => {
    const target = new URL(link.href);
    target.hash = currentSection();
    link.href = target.href;
  };
  link.addEventListener('pointerdown', update);
  link.addEventListener('focus', update);
  link.addEventListener('click', update);
});
