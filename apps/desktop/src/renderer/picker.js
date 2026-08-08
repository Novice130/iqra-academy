/**
 * The picker's own script. Plain JS on purpose — it is one list and two
 * buttons, and a framework here would be more build than behaviour.
 */

const grid = document.getElementById('grid');
const shareButton = document.getElementById('share');
const cancelButton = document.getElementById('cancel');
const audioCheckbox = document.getElementById('audio');
const audioRow = document.getElementById('audio-row');
const tabs = [...document.querySelectorAll('.tab')];

let sources = [];
let kind = 'screen';
let selected = null;

// Only Windows can hand over the system audio mix. Offering the choice
// elsewhere would be a checkbox that silently does nothing.
if (window.picker.platform !== 'win32') audioRow.style.display = 'none';

function render() {
  const visible = sources.filter((s) => (kind === 'screen' ? s.isScreen : !s.isScreen));
  grid.replaceChildren();

  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      kind === 'screen' ? 'No screens available.' : 'No open windows to share.';
    grid.append(empty);
    return;
  }

  for (const source of visible) {
    const button = document.createElement('button');
    button.className = 'source';
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected === source.id));

    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = source.thumbnail;
    thumb.alt = '';

    const label = document.createElement('div');
    label.className = 'label';
    if (source.appIcon) {
      const icon = document.createElement('img');
      icon.src = source.appIcon;
      icon.alt = '';
      label.append(icon);
    }
    const name = document.createElement('span');
    name.textContent = source.name;
    name.title = source.name;
    label.append(name);

    button.append(thumb, label);
    button.addEventListener('click', () => {
      selected = source.id;
      shareButton.disabled = false;
      render();
    });
    // Double-click shares straight away, which is what everyone tries first.
    button.addEventListener('dblclick', () => share(source.id));
    grid.append(button);
  }
}

function share(id) {
  const target = id ?? selected;
  if (!target) return;
  window.picker.choose(target, audioCheckbox.checked);
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    kind = tab.dataset.kind;
    selected = null;
    shareButton.disabled = true;
    for (const other of tabs) other.setAttribute('aria-selected', String(other === tab));
    render();
  });
}

shareButton.addEventListener('click', () => share());
cancelButton.addEventListener('click', () => window.picker.cancel());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.picker.cancel();
  if (event.key === 'Enter') share();
});

window.picker
  .list()
  .then((list) => {
    sources = list;
    // Open on whichever tab has something in it. A first screen is always
    // there, so this only matters on a machine with no windows open.
    if (!sources.some((s) => s.isScreen)) {
      kind = 'window';
      for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.kind === 'window'));
    }
    render();
  })
  .catch(() => {
    grid.replaceChildren();
    const error = document.createElement('p');
    error.className = 'empty';
    error.textContent = "Couldn't read what's on screen. Check screen recording permission.";
    grid.append(error);
  });
