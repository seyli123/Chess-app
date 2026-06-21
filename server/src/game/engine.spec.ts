import { ChessEngine } from './engine';

describe('ChessEngine', () => {
  it('rejects an illegal move', () => {
    const e = new ChessEngine();
    expect(e.applyMove({ from: 'e2', to: 'e5' })).toBeNull();
  });

  it('accepts a legal move and updates turn/fen', () => {
    const e = new ChessEngine();
    const m = e.applyMove({ from: 'e2', to: 'e4' });
    expect(m).not.toBeNull();
    expect(m!.san).toBe('e4');
    expect(e.turn).toBe('black');
  });

  it("detects fool's mate as checkmate (white wins)", () => {
    const e = new ChessEngine();
    e.applyMove({ from: 'f2', to: 'f3' });
    e.applyMove({ from: 'e7', to: 'e5' });
    e.applyMove({ from: 'g2', to: 'g4' });
    e.applyMove({ from: 'd8', to: 'h4' }); // Qh4#
    const end = e.detectEnd();
    expect(end).toEqual({ result: 'BLACK_WINS', termination: 'CHECKMATE' });
  });

  it('detects stalemate as a draw', () => {
    const e = new ChessEngine('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
    expect(e.detectEnd()).toEqual({ result: 'DRAW', termination: 'STALEMATE' });
  });

  it('knows a lone king cannot mate', () => {
    const e = new ChessEngine('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
    expect(e.hasMatingMaterial('white')).toBe(false);
  });
});
