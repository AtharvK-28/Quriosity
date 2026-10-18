import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 23.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
dryL = np.zeros(N); dryR = np.zeros(N)
revL = np.zeros(N); revR = np.zeros(N)   # reverb send
dlyL = np.zeros(N); dlyR = np.zeros(N)   # delay send
duck_bus = {k: (np.zeros(N), np.zeros(N)) for k in ['music']}

def mf(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(n): return np.arange(n) / SR
def filt(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos'); return sosfilt(sos, x)

def place(sig, t, pan=0.0, gain=1.0, rev=0.0, dly=0.0, bus=None):
    i = int(round(t * SR))
    if i >= N: return
    s = sig[: max(0, N - i)] * gain
    if i < 0: s = s[-i:]; i = 0
    gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    tgtL, tgtR = (dryL, dryR) if bus is None else duck_bus[bus]
    tgtL[i:i + len(s)] += s * gl; tgtR[i:i + len(s)] += s * gr
    if rev: revL[i:i + len(s)] += s * gl * rev; revR[i:i + len(s)] += s * gr * rev
    if dly: dlyL[i:i + len(s)] += s * gl * dly; dlyR[i:i + len(s)] += s * gr * dly

def env_adsr(n, a, d, s, r, hold):
    e = np.zeros(n); ta = int(a * SR); td = int(d * SR); th = int(hold * SR); tr = int(r * SR)
    ta = max(ta, 1)
    e[:ta] = np.linspace(0, 1, ta)
    e[ta:ta + td] = np.linspace(1, s, len(e[ta:ta + td]))
    e[ta + td:th] = s
    if th < n: e[th:th + tr] = np.linspace(s, 0, len(e[th:th + tr]))
    return e

# ---------------- instruments ----------------
def saw(f, n, detune_cents=0):
    t = tt(n); ff = f * 2 ** (detune_cents / 1200); out = np.zeros(n); k = 1
    while k * ff < 7000 and k <= 24:
        out += np.sin(2 * np.pi * k * ff * t + rng.uniform(0, 6.28)) / k; k += 1
    return out

def pad_note(m, dur, amp):
    n = int((dur + 0.8) * SR)
    x = saw(mf(m), n, -8) + saw(mf(m), n, 8) + 0.6 * saw(mf(m), n, 0)
    x = filt(x, 'low', 1500)
    return x * env_adsr(n, 0.35, 0.3, 0.85, 0.7, dur) * amp * 0.12

def pluck(m, amp, tau=0.14, bright=0.3):
    n = int(0.9 * SR); t = tt(n); f = mf(m)
    x = np.sin(2 * np.pi * f * t) + bright * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.03)
    e = np.exp(-t / tau) * np.minimum(1, t / 0.003)
    return x * e * amp

def bell(m, amp, decay=1.6):
    n = int((decay * 2.2) * SR); t = tt(n); f = mf(m)
    idx = 2.2 * np.exp(-t / 0.25)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    x += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.4)
    return x * np.exp(-t / decay) * np.minimum(1, t / 0.002) * amp

def marimba(m, amp):
    n = int(0.8 * SR); t = tt(n); f = mf(m)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03)
    return x * np.exp(-t / 0.22) * np.minimum(1, t / 0.002) * amp

def bass_note(m, dur, amp):
    n = int((dur + 0.05) * SR); t = tt(n); f = mf(m)
    x = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    x = np.tanh(1.4 * x) / 1.1
    return x * env_adsr(n, 0.006, 0.12, 0.7, 0.04, dur) * amp

def kick(amp):
    n = int(0.45 * SR); t = tt(n)
    f = 46 + 95 * np.exp(-t / 0.035); ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.26) + 0.3 * filt(rng.standard_normal(n), 'high', 2500) * np.exp(-t / 0.004)
    return np.tanh(1.3 * x) * amp

def clap(amp):
    n = int(0.35 * SR); t = tt(n); nz = filt(rng.standard_normal(n), 'band', [900, 3800])
    e = np.exp(-t / 0.11) * 0.8
    for o in (0.0, 0.009, 0.018): e += np.exp(-np.clip(t - o, 0, None) / 0.006) * (t >= o) * 0.6
    body = 0.35 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return (nz * e + body) * amp * 0.5

def hat(amp, tau=0.03):
    n = int(0.15 * SR); t = tt(n)
    return filt(rng.standard_normal(n), 'high', 7500) * np.exp(-t / tau) * amp * 0.5

def click(amp, f=2400):
    n = int(0.05 * SR); t = tt(n)
    x = 0.6 * filt(rng.standard_normal(n), 'band', [2500, 7000]) * np.exp(-t / 0.004) + np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008)
    return x * amp

def thock(m, amp):
    n = int(0.3 * SR); t = tt(n); f = mf(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07) + 0.4 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.025)
    x += 0.3 * filt(rng.standard_normal(n), 'low', 1200) * np.exp(-t / 0.01)
    return x * amp

def whoosh(dur, amp, f0=400, f1=4000, shape='swell'):
    n = int(dur * SR); t = tt(n); nz = rng.standard_normal(n)
    fc = f0 * (f1 / f0) ** (t / dur); y = np.zeros(n); a = 0.0; s = 0.0
    # time-varying state-variable-ish one pole pair (band-ish)
    lp1 = 0.0; lp2 = 0.0
    for i in range(n):
        g = 1 - np.exp(-2 * np.pi * fc[i] / SR)
        lp1 += g * (nz[i] - lp1); lp2 += g * (lp1 - lp2); y[i] = lp1 - lp2 * 0.6
    if shape == 'swell': e = np.sin(np.pi * t / dur) ** 2
    elif shape == 'rise': e = (t / dur) ** 2 * np.minimum(1, (dur - t) / 0.05)
    else: e = np.exp(-t / (dur * 0.35))
    return y * e * amp

def glide(f0, f1, dur, amp):
    n = int((dur + 0.3) * SR); t = tt(n)
    f = np.where(t < dur, f0 * (f1 / f0) ** (np.minimum(t, dur) / dur), f1)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.minimum(1, t / 0.01) * np.exp(-np.clip(t - dur, 0, None) / 0.08) * amp

def ting(m, amp):
    n = int(1.2 * SR); t = tt(n); f = mf(m); x = np.zeros(n)
    for r, a, d in [(1, 1, .5), (2.76, .5, .25), (5.4, .3, .12), (8.93, .2, .06)]:
        x += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    return x * np.minimum(1, t / 0.001) * amp

def sub_drop(amp, f0=70, f1=36, dur=1.4):
    n = int(dur * SR); t = tt(n); f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5) * np.minimum(1, t / 0.005) * amp

# ---------------- harmony ----------------
CH = {
 'Dmaj9': [50, 57, 61, 64, 66], 'D': [50, 57, 62, 64, 66], 'Bm': [47, 54, 59, 62, 66], 'G': [43, 55, 59, 62, 66],
 'Em': [52, 55, 59, 62, 67], 'C': [48, 55, 60, 64, 67], 'Asus': [45, 57, 62, 64, 69], 'A': [45, 57, 61, 64, 69],
 'G2': [43, 55, 59, 62, 67], 'Dfin': [50, 57, 62, 66, 69]}
ROOT = {'Dmaj9': 38, 'D': 38, 'Bm': 35, 'G': 31, 'Em': 40, 'C': 36, 'Asus': 33, 'A': 33, 'G2': 31, 'Dfin': 38}
PROG = [(0, 3, 'Dmaj9'), (3, 5, 'D'), (5, 7, 'Bm'), (7, 9, 'G'), (9, 11, 'Em'), (11, 13, 'C'), (13, 14, 'Asus'), (14, 15, 'A'),
        (15, 17, 'D'), (17, 18, 'G'), (18, 19, 'A'), (19, 21, 'D'), (21, 22, 'G2'), (22, 23, 'Dfin')]
def chord_at(t):
    for a, b, c in PROG:
        if a <= t < b: return c
    return 'Dfin'

# pad
for a, b, c in PROG:
    amp = 0.42 if a < 3 else 0.3
    if 9 <= a < 13: amp = 0.4
    if 13 <= a < 15: amp = 0.34
    if a >= 19: amp = 0.36
    if a >= 22: amp = 0.5
    for j, m in enumerate(CH[c]):
        place(pad_note(m, (b - a) + (0.6 if a >= 22 else 0.05), amp), a, pan=(j - 2) * 0.22, rev=0.5, bus='music')
# intro swell handled by pad attack; add high shimmer
for i, (t0, m) in enumerate([(0.55, 78), (1.35, 81), (2.1, 85), (2.55, 88)]):
    place(pluck(m, 0.08, tau=0.4, bright=0.1), t0, pan=0.4 * (-1) ** i, rev=0.6, dly=0.4)

# bass
def bass_line():
    t = 5.0
    while t < 22.0 - 1e-6:
        c = chord_at(t + 1e-4); r = ROOT[c]
        if 9 <= t < 13:
            if abs((t - 9) % 2) < 1e-6: place(bass_note(r, 1.8, 0.28), t, bus='music')
            t += 0.5; continue
        step = t - np.floor(t * 2) / 2
        oct_up = 12 if (int(round(t * 2)) % 4 == 3) else 0
        place(bass_note(r + oct_up, 0.2, 0.3), t, bus='music')
        t += 0.25
    place(bass_note(38, 1.0, 0.32), 22.0, bus='music')
bass_line()

# drums
kicks = []
for k in np.arange(5.0, 9.0, 0.5): kicks.append(k)
kicks += [13.0, 13.5, 14.0, 14.5]
for k in np.arange(15.0, 22.0, 0.5): kicks.append(k)
kicks.append(22.0)
for k in kicks: place(kick(0.62 if k != 22.0 else 0.7), k)
for c in [5.5, 6.5, 7.5, 8.5, 10.5, 12.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5]:
    place(clap(0.42 if not (9 < c < 13) else 0.25), c, rev=0.35)
for i, tr in enumerate(np.arange(14.0, 15.0, 0.125)):
    place(clap(0.08 + 0.3 * (i / 7)), tr, rev=0.2)
for h in np.arange(5.25, 22.0, 0.5):
    if 9 <= h < 13: g = 0.12
    else: g = 0.22
    place(hat(g), h, pan=0.25)
for h in np.arange(15.0, 22.0, 0.25):
    if abs((h * 2) % 1) > 1e-6: continue
    place(hat(0.07, 0.015), h + 0.125, pan=-0.25)

# arp
PAT = [0, 1, 2, 3, 4, 3, 2, 1]
def arp():
    step = 0.125; t = 5.0; i = 0
    while t < 22.0 - 1e-6:
        c = chord_at(t + 1e-4); notes = sorted(CH[c])[1:]; notes = [n + 12 for n in notes]
        m = notes[PAT[i % 8] % len(notes)]
        if 9 <= t < 13:
            if i % 2 == 0: place(filt(pluck(m, 0.10, tau=0.1), 'low', 2200), t, pan=0.3 * (-1) ** (i // 2), rev=0.35, dly=0.3, bus='music')
        else:
            g = 0.13 if t < 15 else 0.15
            if t >= 19: g = 0.12
            place(pluck(m, g * (1.0 if i % 4 == 0 else 0.75)), t, pan=0.3 * (-1) ** i, rev=0.25, dly=0.25, bus='music')
        t += step; i += 1
arp()

# ---------------- SFX (in key, tucked under) ----------------
place(ting(86, 0.16), 0.0, pan=0.1, rev=0.4)                      # coin flick (D6)
spin_n = int(1.05 * SR); st = tt(spin_n)
rate = 10 * (1 - st / 1.05) + 1.5; am = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(rate) / SR)
place(filt(rng.standard_normal(spin_n), 'band', [4000, 9000]) * am * np.exp(-st / 0.6) * 0.035, 0.03, rev=0.3)
place(whoosh(0.5, 0.05, 300, 3000), 0.8, rev=0.4)
place(bell(81, 0.07, 1.2), 1.05, pan=-0.1, rev=0.6)                # landing (A5)
place(glide(mf(74), mf(86), 0.2, 0.05), 1.48, pan=0.2, rev=0.5)   # vector swing D5->D6
# reveal
place(sub_drop(0.5), 3.0)
for j, m in enumerate([74, 81, 90]): place(bell(m, 0.09, 1.8), 3.0 + j * 0.03, pan=(j - 1) * 0.3, rev=0.6)
place(whoosh(0.45, 0.035, 250, 2500), 5.35, rev=0.3)
# build
for tc in [6.42, 7.56]: place(click(0.12), tc, pan=-0.3)
place(thock(57, 0.28), 7.05, pan=-0.1, rev=0.15)
place(thock(54, 0.28), 8.30, pan=-0.05, rev=0.15)
for k in range(7): place(click(0.035, 3200 + 200 * (k % 3)), 7.12 + k * 0.034, pan=0.45)
for k in range(11): place(click(0.035, 3200 + 200 * (k % 3)), 8.38 + k * 0.03, pan=0.45)
# run + diagnose
place(click(0.14), 9.22, pan=0.5)
place(glide(mf(64), mf(76), 0.22, 0.04), 9.3, pan=0.3, rev=0.4)
for j, m in enumerate([71, 76]): place(pluck(m, 0.06, 0.12), 9.55 + j * 0.12, pan=-0.2, rev=0.3)
place(marimba(67, 0.2), 10.15, pan=0.1, rev=0.3)                   # "uh-oh" G4 -> E4
place(marimba(64, 0.2), 10.29, pan=0.1, rev=0.3)
place(whoosh(0.3, 0.025, 600, 3000), 10.28, pan=0.4, rev=0.3)
# fix
place(click(0.12), 13.82, pan=-0.1)
place(thock(57, 0.28), 14.32, pan=-0.1, rev=0.15)
for k in range(10): place(click(0.03, 3300), 14.37 + k * 0.021, pan=0.45)
place(click(0.14), 14.72, pan=0.5)
for j, m in enumerate([74, 78, 81, 86]): place(bell(m, 0.085, 1.4), 15.05 + j * 0.055, pan=(j - 1.5) * 0.25, rev=0.55, dly=0.2)
# dialects
place(whoosh(0.5, 0.035, 300, 3500), 16.4, rev=0.3)
for tc, m in [(17.25, 86), (17.75, 83), (18.25, 85)]:
    place(click(0.07, 2800), tc, pan=0.35); place(pluck(m, 0.05, 0.1), tc, pan=0.35, rev=0.4)
place(whoosh(0.35, 0.03, 3000, 300, 'decay'), 18.72, rev=0.3)
# outro
place(sub_drop(0.45, 65, 36, 1.6), 19.0)
for j, m in enumerate([74, 81, 86, 90]): place(bell(m, 0.08, 2.0), 19.0 + j * 0.035, pan=(j - 1.5) * 0.25, rev=0.6)
place(bell(74, 0.06, 2.2), 22.0, rev=0.7)

# ---------------- mix ----------------
# sidechain duck on the music bus
duck = np.ones(N); tn = tt(N)
for k in kicks:
    i = int(k * SR); d = np.exp(-(tn[i:] - k) / 0.11); duck[i:] -= 0.38 * d[:N - i] * (tn[i:] - k < 0.6)
duck = np.clip(duck, 0.55, 1)
mL, mR = duck_bus['music']
dryL += mL * duck; dryR += mR * duck

# ping-pong delay (dotted 8th = 0.375s)
D = int(0.375 * SR); fb = 0.35
dl = filt(dlyL, 'low', 3500); dr = filt(dlyR, 'low', 3500)
outL = np.zeros(N); outR = np.zeros(N)
bufL = dl.copy(); bufR = dr.copy()
for tap in range(1, 6):
    g = fb ** (tap - 1) * 0.5; sh = D * tap
    if sh >= N: break
    if tap % 2: outR[sh:] += bufL[:N - sh] * g; outL[sh:] += bufR[:N - sh] * g
    else: outL[sh:] += bufL[:N - sh] * g; outR[sh:] += bufR[:N - sh] * g
dryL += outL; dryR += outR; revL += outL * 0.4; revR += outR * 0.4

# reverb: synthetic stereo IR
ir_n = int(2.2 * SR); it = tt(ir_n)
irL = rng.standard_normal(ir_n) * np.exp(-it / 0.55); irR = rng.standard_normal(ir_n) * np.exp(-it / 0.55)
irL = filt(irL, 'low', 5000); irR = filt(irR, 'low', 5000)
irL[:int(0.012 * SR)] = 0; irR[:int(0.017 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
wl = fftconvolve(filt(revL, 'high', 250), irL)[:N]; wr = fftconvolve(filt(revR, 'high', 250), irR)[:N]
L = dryL + wl * 0.55; R = dryR + wr * 0.55

L = filt(L, 'high', 28); R = filt(R, 'high', 28)
# gentle bus glue + fade tail
pk = max(np.max(np.abs(L)), np.max(np.abs(R)))
L /= pk; R /= pk
L = np.tanh(1.5 * L) / np.tanh(1.5); R = np.tanh(1.5 * R) / np.tanh(1.5)
fade = np.ones(N); fs = int(22.35 * SR); fade[fs:] = np.linspace(1, 0, N - fs) ** 1.5
fin = np.ones(N); fin[:int(0.01 * SR)] = np.linspace(0, 1, int(0.01 * SR))
L *= fade * fin; R *= fade * fin
out = np.stack([L, R], 1) * 0.89
wavfile.write('score.wav', SR, (out * 32767).astype(np.int16))
print('ok', out.shape, float(np.max(np.abs(out))))
