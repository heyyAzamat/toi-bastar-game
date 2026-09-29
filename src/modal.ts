// Native text input overlay (for the player name): the pixel canvas can't host a keyboard.
export function askName(current: string): Promise<string | null> {
  const modal = document.getElementById('modal')!;
  const form = modal.querySelector('form')!;
  const input = modal.querySelector('input')!;
  input.value = current;
  modal.style.display = 'flex';
  input.focus();
  input.select();
  return new Promise((resolve) => {
    const close = (v: string | null) => {
      modal.style.display = 'none';
      form.onsubmit = null;
      modal.onpointerdown = null;
      resolve(v);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.toUpperCase().replace(/[^A-Z0-9А-ЯЁӘҒҚҢӨҰҮҺІ _.-]/g, '').trim().slice(0, 12);
      close(v || null);
    };
    modal.onpointerdown = (e) => { if (e.target === modal) close(null); };
  });
}
