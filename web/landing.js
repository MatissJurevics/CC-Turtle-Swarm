const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setStatus(label, detail) {
  $('#healthStatus').textContent = label;
  $('#updatedAt').textContent = detail;
}

async function refreshHealth() {
  try {
    const response = await fetch('/health');
    const payload = await response.json();
    setStatus(payload.ok ? 'online' : 'degraded', new Date().toLocaleTimeString());
  } catch (error) {
    setStatus('offline', error.message);
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setStatus('copied', new Date().toLocaleTimeString());
  } catch (error) {
    setStatus('copy failed', error.message);
  }
}

function setupHostText() {
  const host = window.location.host || '127.0.0.1:8787';
  $('#gatewayHost').textContent = host;
  $('#consoleHost').textContent = host;
  const config = `return {
  turtle_id = "fleet-dev-001",
  fleet_url = "ws://${host}/turtle/ws",
  pairing_token = "dev-pairing-token",
  runtime_version = "0.1.0",
  dimension = "overworld",
  initial_facing = "north",
  initial_position = nil
}`;
  $('#configSnippet').textContent = config;
}

function initAccordions() {
  $$('.accordion-item').forEach((item) => {
    item.addEventListener('click', () => {
      $$('.accordion-item').forEach((other) => other.classList.remove('is-open'));
      item.classList.add('is-open');
    });
  });
}

function initMotion() {
  if (!window.gsap || !window.ScrollTrigger) {
    return;
  }
  window.gsap.registerPlugin(window.ScrollTrigger);
  window.gsap.from('.command-nav', { y: -24, opacity: 0, duration: 0.7, ease: 'power3.out' });
  window.gsap.from('.hero-title, .hero-text, .hero-actions', {
    y: 34,
    opacity: 0,
    duration: 0.9,
    stagger: 0.08,
    ease: 'power3.out'
  });
  window.gsap.utils.toArray('.motion-image').forEach((element) => {
    window.gsap.fromTo(element, { scale: 0.96, opacity: 0.72 }, {
      scale: 1,
      opacity: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start: 'top 75%',
        end: 'bottom 25%',
        scrub: true
      }
    });
  });
}

document.addEventListener('click', (event) => {
  const copyButton = event.target.closest('[data-copy], [data-copy-target]');
  if (!copyButton) {
    return;
  }
  const target = copyButton.dataset.copyTarget ? $(`#${copyButton.dataset.copyTarget}`)?.textContent : null;
  copyText(target ?? copyButton.dataset.copy ?? '');
});

setupHostText();
initAccordions();
refreshHealth();
setInterval(refreshHealth, 5000);
window.addEventListener('load', initMotion);
