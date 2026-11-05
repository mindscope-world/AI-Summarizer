// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {saveBlob} from './download';

afterEach(() => vi.restoreAllMocks());

describe('saveBlob', () => {
  it('clicks a temporary download link with the file name, then cleans up', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    Object.assign(URL, {createObjectURL: create, revokeObjectURL: revoke});
    const clicks: {href: string; download: string}[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({href: this.href, download: this.download});
    });

    const blob = new Blob(['x']);
    saveBlob(blob, 'consensus_summary.pdf');

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicks).toEqual([{href: 'blob:fake', download: 'consensus_summary.pdf'}]);
    expect(document.querySelector('a[download]')).toBeNull(); // link removed again
    expect(revoke).not.toHaveBeenCalled(); // not before the browser has started the download
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    vi.useRealTimers();
  });
});
