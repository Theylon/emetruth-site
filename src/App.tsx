import {useEffect, useRef, useState} from 'react';
import {motion, useScroll, useTransform} from 'motion/react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

type FloatingObject = {
  baseY: number;
  mesh: THREE.Object3D;
  rotSpeedX: number;
  rotSpeedY: number;
};

function BackgroundScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const modelBase = new URL('models/', document.baseURI).toString();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#FCF9F8');
    scene.fog = new THREE.FogExp2('#FCF9F8', 0.02);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 15;

    const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.5);
    keyLight.position.set(5, 5, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe6f0ff, 1.0);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe9c176, 4.0);
    rimLight.position.set(0, 5, -10);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.15,
      transmission: 0.95,
      ior: 1.5,
      thickness: 2.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.5,
    });

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const envLight1 = new THREE.PointLight(0xe9c176, 10, 50);
    envLight1.position.set(5, 5, 5);
    const envLight2 = new THREE.PointLight(0xffffff, 10, 50);
    envLight2.position.set(-5, -5, -5);
    envScene.add(envLight1, envLight2);
    scene.environment = pmremGenerator.fromScene(envScene).texture;

    const loader = new GLTFLoader();
    const objects: FloatingObject[] = [];
    let cancelled = false;

    const registerObject = (
      object: THREE.Object3D,
      position: [number, number, number],
      rotSpeedX: number,
      rotSpeedY: number,
      baseY: number,
    ) => {
      object.position.set(...position);
      scene.add(object);
      objects.push({mesh: object, rotSpeedX, rotSpeedY, baseY});
    };

    const createFallbackObject = (geometry: THREE.BufferGeometry, targetSize: number) => {
      const mesh = new THREE.Mesh(geometry, glassMaterial);
      mesh.scale.setScalar(targetSize);
      return mesh;
    };

    const normalizeModel = (model: THREE.Object3D, targetSize: number) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDimension = Math.max(size.x, size.y, size.z) || 1;
      const scaleFactor = targetSize / maxDimension;

      model.scale.setScalar(scaleFactor);
      model.position.sub(center.multiplyScalar(scaleFactor));
      return model;
    };

    const addModelWithFallback = (
      url: string,
      fallbackGeometry: THREE.BufferGeometry,
      position: [number, number, number],
      rotSpeedX: number,
      rotSpeedY: number,
      baseY: number,
      targetSize: number,
    ) => {
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const model = gltf.scene;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = glassMaterial;
            }
          });

          registerObject(
            normalizeModel(model, targetSize),
            position,
            rotSpeedX,
            rotSpeedY,
            baseY,
          );
        },
        undefined,
        () => {
          if (cancelled) return;

          registerObject(
            createFallbackObject(fallbackGeometry, targetSize),
            position,
            rotSpeedX,
            rotSpeedY,
            baseY,
          );
        },
      );
    };

    addModelWithFallback(
      `${modelBase}shape-hero.glb`,
      new THREE.IcosahedronGeometry(1, 0),
      [5.8, 2.3, -2],
      0.002,
      0.003,
      2,
      3.05,
    );
    addModelWithFallback(
      `${modelBase}shape-2.glb`,
      new THREE.OctahedronGeometry(1, 0),
      [-5, -8, -4],
      -0.001,
      0.002,
      -8,
      2.35,
    );
    addModelWithFallback(
      `${modelBase}shape-3.glb`,
      new THREE.TorusKnotGeometry(1, 0.28, 100, 16),
      [5, -18, -3],
      0.003,
      0.001,
      -18,
      1.8,
    );
    addModelWithFallback(
      `${modelBase}shape-4.glb`,
      new THREE.TetrahedronGeometry(1, 0),
      [-4, -28, -5],
      0.002,
      -0.002,
      -28,
      2.9,
    );

    let scrollY = window.scrollY;

    const onScroll = () => {
      scrollY = window.scrollY;
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const targetCameraY = -(scrollY * 0.012);

      camera.position.y += (targetCameraY - camera.position.y) * 0.05;

      objects.forEach((obj, index) => {
        obj.mesh.rotation.x += obj.rotSpeedX;
        obj.mesh.rotation.y += obj.rotSpeedY;
        obj.mesh.position.y = obj.baseY + Math.sin(time * 0.5 + index) * 0.3;
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      pmremGenerator.dispose();
      glassMaterial.dispose();
      objects.forEach(({mesh}) => {
        mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const childMesh = child as THREE.Mesh;
            childMesh.geometry.dispose();
          }
        });
        scene.remove(mesh);
      });
      renderer.dispose();
    };
  }, []);

  return <canvas id="webgl-canvas" ref={canvasRef} aria-hidden="true" />;
}

const marketCards = [
  {
    id: '01',
    heading: 'Liquidity',
    title: 'Thin markets lose traders',
    body:
      'When spreads stay wide and size disappears, traders stop trusting the market. Volume slips, launches feel weak, and retention suffers.',
    points: ['Wide spreads push traders away', 'Weak launches are hard to recover'],
    className: '',
    sectionId: 'problem',
  },
  {
    id: '02',
    heading: 'Retention',
    title: 'Better markets keep users',
    body:
      'For operators, liquidity is product quality. Better depth and cleaner pricing make markets easier to trade and easier to come back to.',
    points: ['Better trader experience', 'Stronger retention'],
    className: 'pt-0 md:pt-32 pl-0 md:pl-12',
    sectionId: 'outcome',
  },
];

const programCards = [
  {
    title: 'Ongoing Market Making',
    body: 'Continuous quoting for live venues to improve spread quality and visible depth.',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    className: '',
  },
  {
    title: 'Launch Seeding',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="2"
          d="M12 3v18m9-9H3m15.5-5.5l-11 11"
        />
      </svg>
    ),
    body: 'Support for new contracts and new venues so markets open with real liquidity.',
    className: 'mt-0 md:mt-16',
  },
  {
    title: 'Market Design Advice',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="2"
          d="M4 6h16M4 12h10M4 18h7"
        />
      </svg>
    ),
    body: 'Input on which markets to open and how to structure them for better early trading.',
    className: '',
  },
  {
    title: 'Venue Collaboration',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="2"
          d="M8 12h8M12 8v8M4 7h4v10H4zM16 7h4v10h-4z"
        />
      </svg>
    ),
    body: 'Hands-on work around APIs, testing, and execution when venue infrastructure needs improvement.',
    className: 'mt-0 md:mt-16',
  },
];

const specialistCards = [
  {
    title: 'Exclusive Sources',
    body: 'Our edge starts with access to data sources that do not sit inside the usual market-making stack.',
    className: 'bg-surface',
    bodyClassName: 'text-muted',
    titleClassName: '',
  },
  {
    title: 'Signal Workflows',
    body: 'We turn fragmented signals into pricing inputs that can actually be used in live markets.',
    className: 'executive-card md:-translate-y-8',
    bodyClassName: 'text-gray-400',
    titleClassName: 'text-white',
  },
  {
    title: 'Built for Event Risk',
    body: 'Those workflows feed execution built for prediction markets, where openings and repricing matter more than generic flow coverage.',
    className: 'bg-surface',
    bodyClassName: 'text-muted',
    titleClassName: '',
  },
];

const proofCards = [
  {
    title: 'Fast Execution',
    body: 'The engine is built to place and adjust orders quickly in live prediction markets.',
  },
  {
    title: 'Private Until Committed',
    body: 'Activity stays private until commitment, reducing signal leakage before orders hit the market.',
  },
  {
    title: '$19M Through The Engine',
    body: 'More than $19M in volume has already moved through the engine in live use.',
  },
];

const navItems = [
  {href: '#program', label: 'Program', sectionId: 'program'},
  {href: '#specialist', label: 'Edge', sectionId: 'specialist'},
  {href: '#proof', label: 'Proof', sectionId: 'proof'},
  {href: '#lps', label: 'LPs', sectionId: 'lps'},
];

const revealUp = {
  hidden: {opacity: 0, y: 40},
  visible: {
    opacity: 1,
    y: 0,
    transition: {duration: 0.75, ease: [0.22, 1, 0.36, 1]},
  },
};

export default function App() {
  const [activeSection, setActiveSection] = useState<string>('program');
  const {scrollYProgress} = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.18], [0, -80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.22], [1, 0.35]);

  useEffect(() => {
    const sectionIds = ['program', 'specialist', 'proof', 'lps'];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: '-22% 0px -45% 0px',
        threshold: [0.2, 0.35, 0.55, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="font-body selection:bg-gold selection:text-primary">
      <BackgroundScene />

      <nav className="glass-nav fixed top-0 z-50 flex w-full items-center justify-between px-8 py-6 transition-all duration-300">
        <div className="font-headline text-xl font-extrabold uppercase tracking-tighter">
          EmeTruth
        </div>
        <div className="hidden items-center gap-12 md:flex">
          {navItems.map((item) => (
            <a
              key={item.sectionId}
              href={item.href}
              data-active={activeSection === item.sectionId}
              className="nav-link font-headline text-xs font-bold uppercase tracking-widest text-muted transition-colors hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </div>
        <a
          href="#contact"
          className="rounded bg-gold px-8 py-4 font-headline text-xs font-bold uppercase tracking-widest text-primary transition-opacity hover:opacity-80"
        >
          Talk To Us
        </a>
      </nav>

      <main className="relative z-10 pt-32">
        <motion.section
          style={{y: heroY, opacity: heroOpacity}}
          className="flex min-h-[85vh] items-center px-8 md:px-16 lg:px-24"
        >
          <motion.div
            className="w-full max-w-6xl"
            initial="hidden"
            animate="visible"
            variants={revealUp}
          >
            <p className="mb-8 font-headline text-sm font-bold uppercase tracking-[0.2em] text-gold">
              For Prediction Markets
            </p>
            <h1 className="mb-12 max-w-5xl font-headline text-5xl leading-[0.94] font-extrabold tracking-tighter md:text-7xl lg:text-[6.25rem]">
              Liquidity Layer
              <br />
              <span className="text-gold">that scales</span>
              <br />
              Prediction Markets.
            </h1>
            <div className="mt-16 flex flex-col items-start gap-8 md:flex-row md:gap-16">
              <div className="h-24 w-1 shrink-0 bg-gold" />
              <p className="max-w-2xl text-lg leading-relaxed font-medium text-muted md:text-xl">
                EmeTruth makes prediction markets liquid and efficient.
              </p>
            </div>
            <div className="mt-12 flex flex-col gap-4 sm:flex-row">
              <a
                href="#contact"
                className="cta-button rounded-full bg-gold px-10 py-5 font-headline text-xs font-bold uppercase tracking-widest text-primary transition-opacity hover:opacity-80"
              >
                Talk To Us
              </a>
              <a
                href="#proof"
                className="secondary-button px-10 py-5 font-headline text-xs font-bold uppercase tracking-widest text-primary"
              >
                View Proof
              </a>
            </div>
          </motion.div>
        </motion.section>

        <section id="problem" className="second-fold relative px-8 py-32 md:px-16 lg:px-24">
          <div className="second-fold__veil" aria-hidden="true" />
          <div className="mx-auto mb-16 max-w-4xl">
            <p className="mb-5 font-headline text-xs font-bold uppercase tracking-[0.2em] text-gold">
              Market Quality
            </p>
            <h2 className="max-w-4xl font-headline text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
              If markets are thin, traders leave.
            </h2>
          </div>
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-24 md:grid-cols-2">
            {marketCards.map((card, index) => (
              <motion.div
                key={card.id}
                id={card.sectionId}
                className={`space-y-12 pr-0 md:pr-12 ${card.className}`}
                variants={revealUp}
                initial="hidden"
                whileInView="visible"
                viewport={{once: true, amount: 0.25}}
                transition={{delay: index * 0.1}}
              >
                <div className="flex items-baseline gap-6">
                  <span className="font-headline text-5xl font-extrabold text-gold">{card.id}</span>
                  <h2 className="font-headline text-3xl font-extrabold uppercase tracking-tight">
                    {card.heading}
                  </h2>
                </div>
                <div className="ambient-shadow fold-card relative bg-surface-elevated p-12">
                  <div className="absolute top-0 left-0 h-16 w-1 bg-gold" />
                  <h3 className="mb-6 font-headline text-2xl font-bold">{card.title}</h3>
                  <p className="mb-10 leading-relaxed text-muted">{card.body}</p>
                  <ul className="space-y-5">
                    {card.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-center gap-4 font-headline text-xs font-bold uppercase tracking-widest"
                      >
                        <div className="h-2 w-2 rounded-full bg-gold" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="program" className="px-8 py-48 md:px-16 lg:px-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-12">
            <motion.div
              className="lg:col-span-5"
              variants={revealUp}
              initial="hidden"
              whileInView="visible"
              viewport={{once: true, amount: 0.3}}
            >
              <p className="mb-6 font-headline text-xs font-bold uppercase tracking-[0.2em] text-gold">
                What We Do
              </p>
              <h2 className="mb-8 font-headline text-5xl leading-[1.1] font-extrabold uppercase tracking-tighter md:text-6xl">
                Making
                <br />
                Prediction Markets
              </h2>
              <p className="mb-12 text-lg leading-relaxed text-muted">
                Built for prediction markets that need reliable liquidity from day one.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:col-span-7">
              {programCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  className={`execution-panel fold-card group flex h-72 flex-col justify-end bg-surface-alt p-12 transition-all duration-500 hover:bg-surface-elevated hover:ambient-shadow ${card.className}`}
                  variants={revealUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{once: true, amount: 0.3}}
                  transition={{delay: index * 0.12}}
                >
                  <div className="mb-8 h-10 w-10 text-gold">{card.icon}</div>
                  <h4 className="font-headline text-lg font-extrabold uppercase tracking-wide">
                    {card.title}
                  </h4>
                  <p className="mt-4 max-w-xs leading-relaxed text-muted">{card.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="specialist" className="intelligence-fold px-8 py-32 md:px-16 lg:px-24">
          <div className="mx-auto max-w-7xl">
            <motion.div
              className="mb-24 text-center"
              variants={revealUp}
              initial="hidden"
              whileInView="visible"
              viewport={{once: true, amount: 0.35}}
            >
              <p className="mb-6 font-headline text-xs font-bold uppercase tracking-[0.2em] text-gold">
                Unfair Advantage
              </p>
              <h2 className="mb-8 font-headline text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
                Better Inputs
                <br />
                Better Markets
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-muted">
                Our edge is not just making markets. It is having access to better information,
                and the internal workflows to structure that information faster than the market.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {specialistCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  className={`ambient-shadow fold-card intelligence-panel relative overflow-hidden p-12 ${card.className}`}
                  variants={revealUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{once: true, amount: 0.28}}
                  transition={{delay: index * 0.08}}
                >
                  <div className="absolute top-0 left-0 h-16 w-1 bg-gold" />
                  <h3
                    className={`mb-6 font-headline text-xl font-extrabold uppercase ${card.titleClassName}`}
                  >
                    {card.title}
                  </h3>
                  <p className={`${card.bodyClassName} leading-relaxed`}>{card.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="proof" className="px-8 py-32 md:px-16 lg:px-24">
          <div className="mx-auto max-w-7xl">
            <motion.div
              className="mb-20 max-w-3xl"
              variants={revealUp}
              initial="hidden"
              whileInView="visible"
              viewport={{once: true, amount: 0.3}}
            >
              <p className="mb-6 font-headline text-xs font-bold uppercase tracking-[0.2em] text-gold">
                Execution Engine
              </p>
              <h2 className="mb-8 font-headline text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
                Engine
                <br />
                In Use
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted">
                The engine is already live, built for fast execution, and keeps activity private
                until committed. It has already carried real volume in market.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {proofCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  className="ambient-shadow fold-card relative overflow-hidden bg-surface-elevated p-12"
                  variants={revealUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{once: true, amount: 0.28}}
                  transition={{delay: index * 0.08}}
                >
                  <div className="absolute top-0 left-0 h-16 w-1 bg-gold" />
                  <h3 className="mb-6 font-headline text-xl font-extrabold uppercase">
                    {card.title}
                  </h3>
                  <p className="leading-relaxed text-muted">{card.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="lps" className="second-fold relative px-8 py-28 md:px-16 lg:px-24">
          <div className="second-fold__veil" aria-hidden="true" />
          <motion.div
            className="ambient-shadow fold-card relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 p-12 md:grid-cols-[1.35fr_0.65fr]"
            variants={revealUp}
            initial="hidden"
            whileInView="visible"
            viewport={{once: true, amount: 0.3}}
          >
            <div className="absolute top-0 left-0 h-20 w-1 bg-gold" />
            <div>
              <p className="mb-6 font-headline text-xs font-bold uppercase tracking-[0.2em] text-gold">
                For LPs
              </p>
              <h2 className="mb-6 font-headline text-4xl font-extrabold uppercase tracking-tighter md:text-5xl">
                Selective Capital
                <br />
                Partners
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted">
                We are open to selective conversations with LPs and strategic capital partners.
                That path stays secondary and handled directly.
              </p>
            </div>
            <div className="flex items-end">
              <a
                href="mailto:partners@emetruth.capital?subject=LP%20Inquiry"
                className="cta-button inline-flex w-full items-center justify-center rounded-full bg-primary px-10 py-5 font-headline text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-85"
              >
                Inquire As An LP
              </a>
            </div>
          </motion.div>
        </section>

        <section id="contact" className="px-8 py-48 text-center">
          <motion.div
            className="mx-auto max-w-4xl"
            variants={revealUp}
            initial="hidden"
            whileInView="visible"
            viewport={{once: true, amount: 0.4}}
          >
            <h2 className="mb-16 font-headline text-6xl leading-[0.9] font-extrabold uppercase tracking-tighter md:text-8xl">
              Need better
              <br />
              markets?
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-muted">
              For conversations around liquidity, partnerships, or capital.
            </p>
            <div className="flex flex-col justify-center gap-6 sm:flex-row">
              <a
                href="mailto:partners@emetruth.capital"
                className="cta-button rounded-full bg-gold px-12 py-5 font-headline text-xs font-bold uppercase tracking-widest text-primary transition-opacity hover:opacity-80"
              >
                Talk To Us
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-8 bg-surface-elevated px-8 py-12 md:flex-row md:px-16 lg:px-24">
        <div className="font-headline text-lg font-extrabold uppercase tracking-tighter">
          EmeTruth
        </div>
        <div className="flex flex-wrap justify-center gap-8">
          <a
            href="#"
            className="font-headline text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-gold"
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="font-headline text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-gold"
          >
            Terms of Service
          </a>
          <a
            href="#"
            className="font-headline text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-gold"
          >
            Regulatory Disclosures
          </a>
          <a
            href="#contact"
            className="font-headline text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-gold"
          >
            Contact
          </a>
        </div>
        <div className="font-headline text-[10px] font-bold uppercase tracking-widest text-muted/50">
          © 2026 EmeTruth. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
}
