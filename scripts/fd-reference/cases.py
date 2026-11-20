# Case runner for the FD second reference pinned in tests/helpers/validation.ts (FD).
# Usage: python cases.py <case> <n> <params...> [box]
#   grid step d = 0.02 / n mm (n 2, 4, 8 -> d 0.01, 0.005, 0.0025); box = grounded box width in mm (default 3)
#   off  <n> W H1 H2 er          offset stripline (planes at y = 0 and y = H1 + H2)
#   emb  <n> W H Hc er [box]     embedded microstrip (box width x 2/3 height)
#   cpwf <n> W G h er [box]      CPW, no backside metal (square box)
#   cpwg <n> W G h er [box]      conductor-backed CPW (square box)
# Prints Z (ohm) and eeff for the grid; extrapolate in d yourself (see docs/validation.md).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fd import *  # noqa: E402,F401,F403

which = sys.argv[1]; n = int(sys.argv[2])
if which in ('cpwg', 'cpwf'):
    W, G, h, er = [float(v) for v in sys.argv[3:7]]; d = 0.01 / n * 2
    Wd = float(sys.argv[7]) if len(sys.argv) > 7 else 3.0; Ht = Wd
    nx = int(round(Wd / d)) + 1; ny = int(round(Ht / d)) + 1; xm = Wd / 2; y0 = Ht / 2
    eps = lambda X, Y: np.where((Y < y0) & (Y > y0 - h), er, 1.0)
    def c(X, Y):
        yield near(Y, y0, d) & (np.abs(X - xm) <= W / 2 + 1e-9), 1.0
        yield near(Y, y0, d) & (np.abs(X - xm) >= W / 2 + G - 1e-9), 0.0
        if which == 'cpwg': yield near(Y, y0 - h, d), 0.0
    run(which + ' W%g G%g h%g er%g box%g' % (W, G, h, er, Wd), nx, ny, d, eps, [c], [1])
if which == 'off':
    W, H1, H2, er = [float(v) for v in sys.argv[3:7]]; d = 0.01 / n * 2
    Wd = 3; nx = int(round(Wd / d)) + 1; ny = int(round((H1 + H2) / d)) + 1; xm = Wd / 2
    eps = lambda X, Y: np.full_like(X, er)
    def c(X, Y): yield near(Y, H1, d) & (np.abs(X - xm) <= W / 2 + 1e-9), 1.0
    run('offset W%g H1 %g H2 %g' % (W, H1, H2), nx, ny, d, eps, [c], [1])
if which == 'emb':
    W, H, Hc, er = [float(v) for v in sys.argv[3:7]]; d = 0.01 / n * 2
    Wd = float(sys.argv[7]) if len(sys.argv) > 7 else 3.0; Ht = Wd * 2 / 3
    nx = int(round(Wd / d)) + 1; ny = int(round(Ht / d)) + 1; xm = Wd / 2
    eps = lambda X, Y: np.where(Y < H + Hc, er, 1.0)
    def c(X, Y): yield near(Y, H, d) & (np.abs(X - xm) <= W / 2 + 1e-9), 1.0
    run('emb W%g H%g Hc%g' % (W, H, Hc), nx, ny, d, eps, [c], [1])
