import numpy as np
src = open('../work/score.py').read().split('# ---------------- harmony')[0]
exec(src)                       # instruments + helpers (defines 23 s buffers; replaced below)
DUR = 156.0; N = int(SR * DUR)
dryL = np.zeros(N); dryR = np.zeros(N); revL = np.zeros(N); revR = np.zeros(N); dlyL = np.zeros(N); dlyR = np.zeros(N)
duck_bus = {'music': (np.zeros(N), np.zeros(N))}

CH = {'Dmaj9': [50, 57, 61, 64, 66], 'D': [50, 57, 62, 64, 66], 'Bm': [47, 54, 59, 62, 66], 'G': [43, 55, 59, 62, 66], 'Em': [52, 55, 59, 62, 67],
      'C': [48, 55, 60, 64, 67], 'Asus': [45, 57, 62, 64, 69], 'A': [45, 57, 61, 64, 69], 'Dfin': [50, 57, 62, 66, 69]}
ROOT = {'Dmaj9': 38, 'D': 38, 'Bm': 35, 'G': 31, 'Em': 40, 'C': 36, 'Asus': 33, 'A': 33, 'Dfin': 38}
PROG = [(0, 'Dmaj9'), (4, 'Bm'), (6, 'G'), (8, 'A'), (10, 'D'), (12, 'Bm'), (14, 'G'),
        (16, 'D'), (18, 'A'), (20, 'Bm'), (22, 'G'), (24, 'D'), (26, 'A'), (28, 'Bm'), (30, 'G'),
        (32, 'G'), (34, 'A'), (36, 'D'), (38, 'Bm'), (40, 'G'), (42, 'A'), (44, 'D'),
        (46, 'D'), (48, 'Bm'), (50, 'G'), (52, 'A'), (54, 'D'), (55.5, 'Em'), (57.5, 'C'), (59.5, 'Asus'), (60.3, 'A'), (61, 'D'), (63, 'Bm'), (65, 'G'), (67, 'A'), (69, 'D'),
        (70, 'Bm'), (72, 'G'), (74, 'D'), (76, 'A'), (78, 'Bm'), (80, 'C'), (82, 'Em'), (84, 'D'), (86, 'A'),
        (88, 'D'), (90, 'G'), (92, 'Bm'), (94, 'A'),
        (96, 'Bm'), (98, 'G'), (100, 'D'), (102, 'A'), (104, 'Bm'), (105, 'A'), (106, 'D'), (108, 'G'), (110, 'A'), (112, 'D'),
        (114, 'D'), (116, 'A'), (118, 'Bm'), (120, 'G'), (122, 'D'), (123.6, 'G'), (126, 'D'), (128, 'A'),
        (130, 'G'), (132, 'D'), (134, 'A'), (136, 'Bm'), (138, 'G'), (140, 'D'), (142, 'Em'), (144, 'A'), (146, 'Asus'),
        (148, 'D'), (150, 'Bm'), (152, 'G'), (153, 'A'), (154, 'Dfin')]
SEGS = [(PROG[i][0], PROG[i + 1][0] if i + 1 < len(PROG) else DUR, PROG[i][1]) for i in range(len(PROG))]
def chord_at(t):
    for a, b, c in SEGS:
        if a <= t < b: return c
    return 'Dfin'

# section -> (pad, kick, clap, hat, bass, arp) modes
def mode(t):
    if t < 10: return 'intro'
    if t < 16: return 'title'
    if t < 32: return 'light'
    if t < 46: return 'full'
    if t < 55.5: return 'full'
    if t < 59.5: return 'thin'
    if t < 61: return 'build'
    if t < 70: return 'full'
    if t < 88: return 'half'
    if t < 96: return 'full'
    if t < 104: return 'drive'
    if t < 106: return 'build'
    if t < 114: return 'drive'
    if t < 123.6: return 'bright'
    if t < 130: return 'calm'
    if t < 148: return 'light'
    if t < 154: return 'full'
    return 'end'
PAD_AMP = {'intro': .42, 'title': .34, 'light': .3, 'full': .26, 'thin': .38, 'build': .3, 'half': .34, 'drive': .24, 'bright': .26, 'calm': .42, 'end': .5}

# pad
for a, b, c in SEGS:
    amp = PAD_AMP[mode(a + 1e-3)]
    for j, m in enumerate(CH[c]):
        place(pad_note(m, (b - a) + (1.2 if a >= 154 else .05), amp), a, pan=(j - 2) * .22, rev=.5, bus='music')
for i, (t0, m) in enumerate([(.6, 78), (1.5, 81), (2.4, 85), (3.1, 88), (6.2, 83), (7.6, 86), (8.8, 81)]):
    place(pluck(m, .07, tau=.4, bright=.1), t0, pan=.4 * (-1) ** i, rev=.6, dly=.4)

# drums / bass / arp by step
kicks = []
step = .125; i = 0; t = 0.0
while t < 154 - 1e-6:
    md = mode(t + 1e-4); beat = round(t / .5, 6); on_beat = abs(beat - round(beat)) < 1e-6; b = int(round(t / .5)) if on_beat else None
    q = int(round(t / step)); pos16 = q % 16  # position within a 2 s bar (bars start on even seconds)
    c = chord_at(t + 1e-4)
    # kick
    kk = False
    if md in ('full', 'drive', 'bright') and pos16 % 4 == 0: kk = True
    if md in ('title', 'light') and pos16 in (0, 8): kk = True
    if md == 'half' and pos16 == 0: kk = True
    if md == 'build' and pos16 % 4 == 0: kk = True
    if kk: place(kick(.6), t); kicks.append(t)
    # clap
    if md in ('full', 'drive', 'bright') and pos16 in (4, 12): place(clap(.4), t, rev=.35)
    if md == 'light' and pos16 == 12: place(clap(.26), t, rev=.35)
    if md == 'half' and pos16 == 8: place(clap(.34), t, rev=.4)
    if md == 'thin' and pos16 == 12: place(clap(.2), t, rev=.4)
    if md == 'build': place(clap(.06 + .22 * ((t % 2) / 2)), t, rev=.2) if pos16 % 1 == 0 and pos16 >= 8 or md == 'build' and pos16 % 2 == 0 else None
    # hats
    if md in ('full', 'bright', 'light', 'title', 'half') and pos16 % 4 == 2: place(hat(.2 if md != 'title' else .12), t, pan=.25)
    if md == 'drive': place(hat(.16 if pos16 % 2 else .09, .02), t, pan=.25 * (-1) ** pos16)
    if md == 'thin' and pos16 % 4 == 2: place(hat(.1), t, pan=.25)
    if md in ('full', 'bright') and pos16 % 2 == 1: place(hat(.05, .012), t, pan=-.25)
    # bass
    r = ROOT[c]
    if md in ('full', 'drive', 'bright', 'build') and pos16 % 2 == 0:
        up = 12 if pos16 % 8 == 6 else 0; place(bass_note(r + up, .2, .3 if md != 'drive' else .32), t, bus='music')
    if md in ('light', 'title') and pos16 % 4 == 0: place(bass_note(r, .42, .26), t, bus='music')
    if md in ('half', 'thin', 'calm') and pos16 == 0: place(bass_note(r, 1.8, .24), t, bus='music')
    # arp
    notes = [n + 12 for n in sorted(CH[c])[1:]]; PAT = [0, 1, 2, 3, 4, 3, 2, 1]; m = notes[PAT[q % 8] % len(notes)]
    if md in ('full', 'drive', 'bright', 'build'):
        g = .13 if md != 'bright' else .15
        mm = m + (12 if md == 'bright' and q % 4 == 0 else 0)
        place(pluck(mm, g * (1 if q % 4 == 0 else .72)), t, pan=.3 * (-1) ** q, rev=.25, dly=.25, bus='music')
    elif md in ('light', 'title', 'half', 'calm') and q % 2 == 0:
        place(filt(pluck(m, .11 if md != 'title' else .08, tau=.12), 'low', 3000 if md != 'half' else 2000), t, pan=.3 * (-1) ** (q // 2), rev=.35, dly=.3, bus='music')
    elif md == 'thin' and q % 2 == 0:
        place(filt(pluck(m, .09, tau=.1), 'low', 1800), t, pan=.3 * (-1) ** (q // 2), rev=.35, dly=.3, bus='music')
    t = round(t + step, 6)
place(kick(.7), 154.0); place(bass_note(38, 1.4, .3), 154.0, bus='music'); kicks.append(154.0)

def crash(amp):
    n = int(1.8 * SR); tt_ = tt(n); return filt(rng.standard_normal(n), 'high', 3500) * np.exp(-tt_ / .5) * amp
def bells(ms, t0, amp=.08, gap=.05, rev=.6, dec=1.5):
    for j, m in enumerate(ms): place(bell(m, amp, dec), t0 + j * gap, pan=(j - (len(ms) - 1) / 2) * .25, rev=rev, dly=.15)
def ticks(t0, t1, n, amp=.03, f=3300, pan=.4):
    for k in range(n): place(click(amp, f + 200 * (k % 3)), t0 + (t1 - t0) * k / max(1, n - 1), pan=pan)

# ---------------- SFX ----------------
# S0
place(ting(86, .16), 0.0, pan=.1, rev=.4)
sn = int(1.3 * SR); st = tt(sn); rate = 10 * (1 - st / 1.3) + 1.5; am = .5 + .5 * np.sin(2 * np.pi * np.cumsum(rate) / SR)
place(filt(rng.standard_normal(sn), 'band', [4000, 9000]) * am * np.exp(-st / .7) * .035, .03, rev=.3)
place(whoosh(.6, .05, 300, 3000), 1.0, rev=.4); place(bell(81, .07, 1.2), 1.35, rev=.6); place(glide(mf(74), mf(86), .2, .05), 2.0, pan=.2, rev=.5)
place(whoosh(.6, .05, 400, 4000, 'rise'), 4.4, rev=.3); place(sub_drop(.35, 80, 40, 1.0), 5.0); bells([74, 81, 86], 5.0, .08)
# S1
place(sub_drop(.5), 10.0); bells([74, 81, 90], 10.0, .09, .03, dec=1.8)
# S2
B = 16
place(click(.12), B + 1.6, pan=.3); [place(pluck(62 + k * 2 % 12 + 12, .025, .05), B + 1.75 + k * .17, pan=.4) for k in range(9)]
place(click(.12), B + 4.1, pan=.3); ticks(B + 4.25, B + 5.0, 18, .02, 3600)
place(click(.12), B + 5.85, pan=.3); [place(pluck(69 + k % 5, .022, .05), B + 6.05 + k * .17, pan=.4) for k in range(9)]
place(click(.13), B + 8.4, pan=.3); place(glide(mf(74), mf(62), .6, .05), B + 8.55, pan=-.2, rev=.5)
place(click(.12), B + 9.55, pan=.3); ticks(B + 9.75, B + 10.5, 18, .02, 3900)
place(click(.1), B + 11.35); place(whoosh(1.9, .02, 300, 1500), B + 11.5, rev=.3)
# S3 node passes
NX = []; x = 300
for n in [3, 6, 5, 5]:
    for _ in range(n): NX.append(x); x += 220
    x += 110
def eio(p): return 4 * p ** 3 if p < .5 else 1 - (-2 * p + 2) ** 3 / 2
ts_ = np.linspace(.8, 6.2, 5000); dx = [NX[0] + (NX[10] - NX[0]) * eio((tq - .8) / 5.4) for tq in ts_]
scale = [62, 64, 66, 67, 69, 71, 73, 74, 76, 78]
for i in range(1, 10):
    tq = ts_[np.searchsorted(dx, NX[i])]; place(pluck(scale[i] + 12, .06, .18), 32 + tq, pan=-.2 + i * .04, rev=.4, dly=.2)
bells([74, 78, 81], 32 + 6.2, .07)
for i in range(4): place(pluck([74, 78, 81, 86][i], .06, .15), 32 + 9.4 + i * .15, rev=.4)
# S4 bench
B = 46
place(click(.12), B + 4.47, pan=-.3); place(thock(57, .28), B + 5.1, rev=.15); ticks(B + 5.15, B + 5.4, 7, .035, 3200, .45)
place(click(.12), B + 5.62, pan=-.3); place(thock(54, .28), B + 6.4, rev=.15); ticks(B + 6.46, B + 6.8, 11, .035, 3200, .45)
place(click(.14), B + 9.3, pan=.5); place(glide(mf(64), mf(76), .22, .04), B + 9.35, pan=.3, rev=.4)
place(marimba(67, .2), B + 10.2, rev=.3); place(marimba(64, .2), B + 10.34, rev=.3); place(whoosh(.3, .025, 600, 3000), B + 10.35, pan=.4, rev=.3)
place(click(.12), B + 13.8); place(thock(57, .28), B + 14.32, rev=.15); ticks(B + 14.37, B + 14.57, 10, .03, 3300, .45); place(click(.14), B + 14.72, pan=.5)
bells([74, 78, 81, 86], B + 15.05, .085, .055)
bells([74, 81], B + 19.1, .05, .08)
# S5 tutor
B = 70
ticks(B + .9, B + 2.2, 16, .03, 3300, .35)
for tq, m in [(2.4, 69), (3.0, 74), (3.6, 78)]: place(pluck(m, .06, .15), B + tq, rev=.4, dly=.2)
ticks(B + 3.85, B + 6.0, 33, .012, 4200, -.2)
place(bell(62, .06, 1.8), B + 7.0, rev=.6); place(whoosh(.5, .03, 200, 2000), B + 6.9, rev=.3)
place(whoosh(2.6, .018, 1500, 5000), B + 7.3, rev=.2)
place(pluck(81, .07, .2), B + 8.4, rev=.4); place(pluck(86, .07, .25), B + 8.52, rev=.4)
place(marimba(62, .22), B + 9.9, rev=.3); place(marimba(59, .22), B + 10.04, rev=.3)
place(filt(rng.standard_normal(int(.35 * SR)), 'low', 1800) * np.exp(-tt(int(.35 * SR)) / .08) * .12, B + 12.8, rev=.2)
place(thock(50, .3), B + 13.0, rev=.2); bells([74, 78, 81], B + 14.0, .08)
# S6
for tq, m in [(1.7, 86), (2.9, 83), (4.1, 90), (5.3, 81)]: place(click(.07, 2800), 88 + tq, pan=.35); place(pluck(m, .05, .12), 88 + tq, pan=.35, rev=.4)
# S7 arena
B = 96
place(pluck(81, .06, .1), B + 1.4); place(pluck(86, .07, .15), B + 1.52)
for tq in [2.2, 3.0, 3.8]: place(thock(57, .24), B + tq, pan=-.45, rev=.15)
for tq in [2.6, 3.5, 4.6]: place(thock(52, .22), B + tq, pan=.45, rev=.15)
place(click(.12), B + 4.3, pan=-.4); place(bell(81, .05, .9), B + 4.33, pan=-.3, rev=.4); place(click(.1), B + 5.4, pan=.4)
place(whoosh(.5, .025, 300, 2000), B + 6.9, rev=.3); place(pluck(69, .05, .1), B + 7.1)
place(pluck(81, .07, .2), B + 8.2, pan=-.3, rev=.4); place(pluck(86, .07, .25), B + 8.32, pan=-.3, rev=.4)
place(marimba(62, .2), B + 9.2, pan=.3, rev=.3); place(marimba(57, .2), B + 9.34, pan=.3, rev=.3)
place(whoosh(2.0, .04, 300, 6000, 'rise'), B + 8.0, rev=.3)
place(crash(.12), B + 10.0, rev=.4); place(sub_drop(.4), B + 10.0); bells([74, 78, 81, 86, 90], B + 10.0, .08, .06)
ticks(B + 10.3, B + 11.0, 9, .025, 3600, 0)
place(whoosh(.6, .04, 400, 3000), B + 12.8, pan=.4, rev=.3); place(pluck(83, .06, .08), B + 13.4, pan=.4); place(pluck(86, .06, .08), B + 13.5, pan=.4)
for tq, pn in [(14.8, -.45), (15.2, .45), (15.8, -.45), (16.4, .45)]: place(thock(57 if pn < 0 else 52, .22), B + tq, pan=pn, rev=.15)
# S8 daily
B = 114
place(thock(57, .24), B + 2.0, pan=-.4, rev=.15); place(thock(54, .24), B + 2.6, pan=-.4, rev=.15)
bells([81, 86], B + 3.0, .06, .07); place(pluck(78, .05, .15), B + 3.1, pan=.4, rev=.3)
place(pluck(86, .09, .25), B + 3.8, rev=.4); place(sub_drop(.25, 90, 45, .6), B + 3.8)
bells([90, 93], B + 4.3, .035, .08)
place(pluck(81, .05, .15), B + 4.9, pan=.4, rev=.3); place(pluck(83, .045, .12), B + 5.6, pan=.4, rev=.3); place(pluck(85, .05, .15), B + 6.3, pan=.4, rev=.3)
bells([74, 78, 81, 86], B + 6.6, .065, .06)
place(click(.12), B + 9.5, pan=.5); place(whoosh(.5, .035, 3000, 300, 'decay'), B + 9.8, rev=.3); place(whoosh(1.0, .02, 300, 2500), B + 10.2, rev=.3)
# S9 teach
B = 130
for i in range(7): place(pluck(74 - i, .03, .1), B + 1.2 + i * .15, pan=.3, rev=.3)
place(click(.12), B + 7.15, pan=.3); place(whoosh(.45, .03, 400, 2500), B + 7.4, pan=-.3, rev=.3)
place(marimba(64, .16), B + 8.0, pan=-.3, rev=.3)
place(whoosh(.5, .035, 300, 3000), B + 12.6, rev=.3)
place(click(.1), B + 13.12, pan=-.3); place(thock(57, .26), B + 13.6, pan=-.3, rev=.15); place(click(.1), B + 13.87, pan=-.3); place(thock(54, .26), B + 14.3, pan=-.3, rev=.15)
bells([74, 81], B + 14.5, .06, .08)
for i in range(4): place(pluck([81, 86, 76, 79][i], .04, .1), B + 15.0 + i * .12, pan=-.2, rev=.3)
ticks(B + 15.2, B + 15.9, 12, .025, 3300, .4); place(click(.12), B + 16.25, pan=.4); bells([81, 86], B + 16.35, .06, .07)
# S10
place(sub_drop(.45, 65, 36, 1.6), 148.0); bells([74, 81, 86, 90], 148.0, .08, .035, dec=2.0); place(bell(74, .06, 2.4), 154.0, rev=.7)

# ---------------- mix ----------------
duck = np.ones(N); tn = tt(N)
for k in kicks:
    i0 = int(k * SR); e = min(N, i0 + int(.6 * SR)); duck[i0:e] -= .38 * np.exp(-(tn[i0:e] - k) / .11)
duck = np.clip(duck, .55, 1); mL, mR = duck_bus['music']; dryL += mL * duck; dryR += mR * duck
D = int(.375 * SR); dl = filt(dlyL, 'low', 3500); dr = filt(dlyR, 'low', 3500); oL = np.zeros(N); oR = np.zeros(N)
for tap in range(1, 6):
    g = .35 ** (tap - 1) * .5; sh = D * tap
    if tap % 2: oR[sh:] += dl[:N - sh] * g; oL[sh:] += dr[:N - sh] * g
    else: oL[sh:] += dl[:N - sh] * g; oR[sh:] += dr[:N - sh] * g
dryL += oL; dryR += oR; revL += oL * .4; revR += oR * .4
irn = int(2.2 * SR); it = tt(irn); irL = filt(rng.standard_normal(irn) * np.exp(-it / .55), 'low', 5000); irR = filt(rng.standard_normal(irn) * np.exp(-it / .55), 'low', 5000)
irL[:int(.012 * SR)] = 0; irR[:int(.017 * SR)] = 0; irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
from scipy.signal import fftconvolve
L = dryL + fftconvolve(filt(revL, 'high', 250), irL)[:N] * .55; R = dryR + fftconvolve(filt(revR, 'high', 250), irR)[:N] * .55
L = filt(L, 'high', 28); R = filt(R, 'high', 28); pk = max(np.abs(L).max(), np.abs(R).max()); L /= pk; R /= pk
L = np.tanh(1.5 * L) / np.tanh(1.5); R = np.tanh(1.5 * R) / np.tanh(1.5)
fade = np.ones(N); fs = int(155.0 * SR); fade[fs:] = np.linspace(1, 0, N - fs) ** 1.5
out = np.stack([L * fade, R * fade], 1) * .89
wavfile.write('score.wav', SR, (out * 32767).astype(np.int16)); print('ok', out.shape)
