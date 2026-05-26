function applyRevealAnimations() {
  const animatedItems = document.querySelectorAll('[data-animate]');

  animatedItems.forEach((item, index) => {
    item.style.setProperty('--delay', `${Math.min(index * 70, 420)}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  animatedItems.forEach((item) => observer.observe(item));
}

function applySplitTextAnimations() {
  const splits = document.querySelectorAll('[data-split-text]');
  splits.forEach((node) => {
    if (node.dataset.splitDone === 'true') return;
    const lines = node.innerHTML.split('<br>');
    node.innerHTML = lines
      .map((line) => {
        const words = line
          .trim()
          .split(/\s+/)
          .map((w, i) => `<span class="split-word" style="--w:${i}">${w}</span>`)
          .join(' ');
        return `<span class="split-line">${words}</span>`;
      })
      .join('');
    node.dataset.splitDone = 'true';

    if (node.dataset.highlightLast === 'true') {
      const words = node.querySelectorAll('.split-word');
      if (words.length) words[words.length - 1].classList.add('hl');
    }
  });

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('split-ready');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );
  splits.forEach((s) => obs.observe(s));
}

function applyCountUpAnimations() {
  const counters = document.querySelectorAll('[data-countup-target]');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const target = Number(entry.target.dataset.countupTarget || '0');
        const valueNode = entry.target.querySelector('.countup-value');

        if (!valueNode || entry.target.dataset.countupDone === 'true') {
          observer.unobserve(entry.target);
          return;
        }

        const duration = 900;
        const startedAt = performance.now();

        function tick(now) {
          const progress = Math.min((now - startedAt) / duration, 1);
          const nextValue = Math.round(target * progress);
          valueNode.textContent = String(nextValue);

          if (progress < 1) {
            requestAnimationFrame(tick);
            return;
          }

          entry.target.dataset.countupDone = 'true';
        }

        requestAnimationFrame(tick);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.3 }
  );

  counters.forEach((item) => {
    item.dataset.countupDone = 'false';
    const valueNode = item.querySelector('.countup-value');
    if (valueNode) {
      valueNode.textContent = '0';
    }
    observer.observe(item);
  });
}

function initializeAnimations() {
  applySplitTextAnimations();
  applyRevealAnimations();
  applyCountUpAnimations();
}

document.addEventListener('DOMContentLoaded', initializeAnimations);
document.addEventListener('ui:content-updated', initializeAnimations);
