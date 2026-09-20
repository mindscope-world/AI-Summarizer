// @vitest-environment jsdom
import {useState} from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CommentsDrawer} from '../components/CommentsDrawer';
import {SettingsModal} from '../components/SettingsModal';
import {ArchitectureModal} from '../components/ArchitectureModal';
import {WatchDemoModal} from '../components/WatchDemoModal';
import {useModal} from './useModal';

afterEach(cleanup);

function Demo({onClose = () => undefined}: {onClose?: () => void}) {
  const [open, setOpen] = useState(false);
  const ref = useModal<HTMLDivElement>(open, () => {
    onClose();
    setOpen(false);
  });
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <button>outside</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="Demo" tabIndex={-1}>
          <button>first</button>
          <input aria-label="middle" />
          <button disabled>disabled</button>
          <button>last</button>
        </div>
      )}
    </>
  );
}

describe('useModal', () => {
  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByText('open'));
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('keeps Tab and Shift+Tab inside the dialog, skipping disabled controls', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByText('open'));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('middle'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText('last'));
    await user.tab(); // wraps to the first, never to "outside"
    expect(document.activeElement).toBe(screen.getByText('first'));
    await user.tab({shift: true}); // and backwards to the last
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('closes on Escape and returns focus to what opened it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const opener = screen.getByText('open');
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('prefers the element marked data-autofocus', async () => {
    function Auto() {
      const ref = useModal<HTMLDivElement>(true, () => undefined);
      return (
        <div ref={ref} role="dialog" aria-label="Auto" tabIndex={-1}>
          <button>close</button>
          <input aria-label="name" data-autofocus />
        </div>
      );
    }
    render(<Auto />);
    expect(document.activeElement).toBe(screen.getByLabelText('name'));
  });

  it('does not steal focus again when the parent re-renders', async () => {
    const user = userEvent.setup();
    function Rerender() {
      const [n, setN] = useState(0);
      const ref = useModal<HTMLDivElement>(true, () => undefined);
      return (
        <div ref={ref} role="dialog" aria-label="R" tabIndex={-1}>
          <button>a</button>
          <button onClick={() => setN(n + 1)}>count {n}</button>
        </div>
      );
    }
    render(<Rerender />);
    await user.click(screen.getByText(/count/));
    expect(document.activeElement).toBe(screen.getByText('count 1'));
  });
});

describe('the app’s dialogs', () => {
  it.each([
    ['Settings', <SettingsModal isOpen onClose={() => undefined} />],
    ['Architecture', <ArchitectureModal isOpen onClose={() => undefined} />],
    ['Product tour', <WatchDemoModal isOpen onClose={() => undefined} onLaunchWorkspace={() => undefined} />],
    ['Comments', <CommentsDrawer isOpen onClose={() => undefined} comments={[]} onAddComment={() => undefined} />],
  ])('%s is a named modal dialog that takes focus and closes on Escape', async (_name, element) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const withClose = {...element, props: {...element.props, onClose}};
    render(withClose);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)?.textContent?.trim()).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    // Icon-only close buttons have a name for screen readers.
    expect(screen.getAllByRole('button', {name: /close/i}).length).toBeGreaterThan(0);
  });
});
