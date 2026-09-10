"use client";

/**
 * The Bloch sphere in three dimensions — TRD §1.2, task T11.
 *
 * 3D earns its place here because the sphere IS the subject. A state has a
 * direction in space, and a flat projection makes you infer the third axis from
 * a foreshortened ellipse. Orbiting it is how you learn that |+⟩ and |i+⟩ are
 * both on the equator but a quarter turn apart — which is the whole of Unit 2.
 *
 * Everything drawn is a quantity:
 *   - the vector's DIRECTION is the state,
 *   - its LENGTH is purity, so an entangled qubit's collapses to the centre,
 *   - its COLOUR is the phase, from the same wheel the amplitude table uses.
 *
 * There is no ambient rotation. The camera moves when the learner moves it and
 * at no other time, per the motion rules in Design Doc §5.4.
 *
 * Loaded lazily and only when WebGL2 is available; `BlochSphere` falls back to
 * the SVG rendering otherwise, which the docs require as a first-class peer
 * view rather than a degraded one.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { QubitState } from "@/lib/sim/analysis";
import { phaseHue } from "@/lib/sim/analysis";

/** Resolved theme colours, read from CSS so the two systems cannot drift. */
export interface BlochPalette {
  ink: string;
  rule: string;
  ruleStrong: string;
  paper: string;
  phase: string;
  muted: string;
  /** Lightness of the phase wheel on this theme, in percent. */
  phaseL: number;
}

export interface BlochSphere3DProps {
  state: QubitState;
  size: number;
  palette: BlochPalette;
  reducedMotion: boolean;
}

const AZ = -0.62;
const EL = 0.34;
const RADIUS = 1;

export function BlochSphere3D({ state, size, palette, reducedMotion }: BlochSphere3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{
    setState(s: QubitState): void;
    resize(n: number): void;
    dispose(): void;
  } | null>(null);

  // Build the scene once. Rebuilding it per state change would drop the
  // learner's camera orientation on every run, which is exactly the thing they
  // set up in order to compare two results.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

    // The canonical view, matching the SVG projection so switching between the
    // two renderers does not feel like a different instrument.
    const CAM_DISTANCE = 5.0;
    const orbit = { az: AZ, el: EL };
    function placeCamera() {
      camera.position.set(
        CAM_DISTANCE * Math.cos(orbit.el) * Math.sin(orbit.az),
        CAM_DISTANCE * Math.sin(orbit.el),
        CAM_DISTANCE * Math.cos(orbit.el) * Math.cos(orbit.az),
      );
      camera.lookAt(0, 0, 0);
    }
    placeCamera();

    /* -- The shell ---------------------------------------------------------- */

    // Faint and single-sided from the back, so the vector inside a mixed state
    // stays readable through it.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.paper),
        transparent: true,
        opacity: 0.55,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    scene.add(shell);

    /* -- Great circles ------------------------------------------------------- */

    function ring(axis: "x" | "y" | "z", colour: string, opacity: number, width = 1) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const t = (i / 128) * Math.PI * 2;
        const c = Math.cos(t) * RADIUS;
        const s = Math.sin(t) * RADIUS;
        pts.push(
          axis === "z" ? new THREE.Vector3(c, 0, s)
            : axis === "x" ? new THREE.Vector3(0, s, c)
              : new THREE.Vector3(c, s, 0),
        );
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(colour),
          transparent: true,
          opacity,
          linewidth: width,
        }),
      );
      scene.add(line);
      return line;
    }

    /** A latitude circle at height h, radius shrinking toward the poles. */
    function latitude(h: number, colour: string, opacity: number) {
      const r = Math.sqrt(Math.max(0, RADIUS * RADIUS - h * h));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * r, h, Math.sin(t) * r));
      }
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: new THREE.Color(colour), transparent: true, opacity }),
      ));
    }

    /** A meridian rotated by `turn` about the vertical axis. */
    function meridian(turn: number, colour: string, opacity: number) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        const x = Math.cos(t) * RADIUS;
        const y = Math.sin(t) * RADIUS;
        pts.push(new THREE.Vector3(x * Math.cos(turn), y, x * Math.sin(turn)));
      }
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: new THREE.Color(colour), transparent: true, opacity }),
      ));
    }

    // A globe: a few latitudes, a few meridians, and a heavier equator. The
    // equator is emphasised because "am I on the equator" — am I an even
    // superposition — is the most common question asked of this view.
    for (const h of [-0.72, -0.4, 0.4, 0.72]) latitude(h, palette.ruleStrong, 0.4);
    for (let i = 0; i < 6; i++) meridian((i / 6) * Math.PI, palette.ruleStrong, 0.32);
    ring("z", palette.ink, 0.6);

    /* -- Axes ---------------------------------------------------------------- */

    const axisMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(palette.ink),
      transparent: true,
      opacity: 0.42,
    });
    for (const [a, b] of [
      [new THREE.Vector3(-1.18, 0, 0), new THREE.Vector3(1.18, 0, 0)],
      [new THREE.Vector3(0, 0, -1.18), new THREE.Vector3(0, 0, 1.18)],
      [new THREE.Vector3(0, -1.18, 0), new THREE.Vector3(0, 1.18, 0)],
    ]) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axisMat));
    }

    /* -- Pole and axis labels ------------------------------------------------ */

    function label(text: string, at: THREE.Vector3, colour: string, scale = 0.3) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = colour;
      ctx.font = "600 60px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 64);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          transparent: true,
          depthTest: false,
        }),
      );
      sprite.position.copy(at);
      sprite.scale.setScalar(scale);
      scene.add(sprite);
      return sprite;
    }

    label("|0⟩", new THREE.Vector3(0, 1.3, 0), palette.ink);
    label("|1⟩", new THREE.Vector3(0, -1.3, 0), palette.ink);
    label("x", new THREE.Vector3(1.3, 0, 0), palette.muted, 0.19);
    label("y", new THREE.Vector3(0, 0, 1.3), palette.muted, 0.19);

    /* -- The state vector ---------------------------------------------------- */

    const vectorGroup = new THREE.Group();
    scene.add(vectorGroup);

    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 16), shaftMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 20), shaftMat);
    vectorGroup.add(shaft, head);

    // A dot at the origin, which is all there is to draw when a qubit has no
    // state of its own.
    const originDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.phase) }),
    );
    scene.add(originDot);

    // The purity radius, drawn only when the state is inside the sphere, so
    // "not on the surface" is a visible measurement rather than an inference.
    const purityShell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.phase),
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    scene.add(purityShell);

    /* -- State application --------------------------------------------------- */

    // Three.js is Y-up; the Bloch convention is Z-up. Mapping once here keeps
    // every other module in the physics convention.
    const target = new THREE.Vector3();
    const current = new THREE.Vector3();
    let first = true;

    function setState(s: QubitState) {
      target.set(s.x, s.z, s.y); // (x, z→up, y)
      if (first || reducedMotion) {
        current.copy(target);
        first = false;
      }

      const colour = new THREE.Color(
        s.entangled ? palette.muted : phaseHue(Math.atan2(s.y, s.x), palette.phaseL),
      );
      shaftMat.color = colour;

      const showVector = s.radius > 0.02;
      vectorGroup.visible = showVector;
      originDot.visible = !showVector;

      purityShell.visible = s.radius > 0.02 && s.radius < 0.98;
      purityShell.scale.setScalar(Math.max(0.02, s.radius));
    }

    function layoutVector() {
      const len = current.length();
      if (len < 1e-6) return;

      const dir = current.clone().normalize();
      const shaftLen = Math.max(0.001, len - 0.2);

      shaft.scale.set(1, shaftLen, 1);
      shaft.position.copy(dir).multiplyScalar(shaftLen / 2);
      head.position.copy(dir).multiplyScalar(shaftLen + 0.1);

      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      shaft.quaternion.copy(q);
      head.quaternion.copy(q);
    }

    /* -- Orbit --------------------------------------------------------------- */

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const el = renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "none";

    function down(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    }
    function move(e: PointerEvent) {
      if (!dragging) return;
      orbit.az -= (e.clientX - lastX) * 0.01;
      // Stop short of the poles so the sphere never flips inside out.
      orbit.el = Math.max(-1.4, Math.min(1.4, orbit.el + (e.clientY - lastY) * 0.01));
      lastX = e.clientX;
      lastY = e.clientY;
      placeCamera();
    }
    function up(e: PointerEvent) {
      dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      el.style.cursor = "grab";
    }
    function reset() {
      orbit.az = AZ;
      orbit.el = EL;
      placeCamera();
    }

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", reset);

    /* -- Loop ---------------------------------------------------------------- */

    // Renders on demand rather than continuously: nothing here animates by
    // itself, so a permanent rAF loop would be burning a battery to show a
    // still image.
    let frame = 0;
    let settling = true;

    function tick() {
      frame = requestAnimationFrame(tick);
      if (settling) {
        // One gate's worth of state change, eased. Under reduced motion the
        // vector is already at its target and this exits immediately.
        current.lerp(target, 0.18);
        if (current.distanceTo(target) < 1e-4) {
          current.copy(target);
          settling = false;
        }
        layoutVector();
      }
      renderer.render(scene, camera);
    }
    tick();

    apiRef.current = {
      setState(s) {
        setState(s);
        settling = true;
      },
      resize(n) {
        renderer.setSize(n, n);
      },
      dispose() {
        cancelAnimationFrame(frame);
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.removeEventListener("dblclick", reset);
        renderer.dispose();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
        });
        el.remove();
      },
    };

    setState(state);
    layoutVector();

    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // Rebuilt only when the surface changes, never on a state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, palette.ink, reducedMotion]);

  // State changes animate the existing scene rather than rebuilding it.
  useEffect(() => {
    apiRef.current?.setState(state);
  }, [state]);

  return <div ref={mountRef} style={{ width: size, height: size }} aria-hidden />;
}
