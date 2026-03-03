const pokedex = document.querySelector('.pokedex');
const arrowRight = document.querySelector('.nav-arrow-right');
const arrowLeft = document.querySelector('.nav-arrow-left');

function isMobile() {
  return window.innerWidth <= 768;
}

arrowRight.addEventListener('click', () => {
  if (isMobile()) pokedex.style.transform = 'translateX(-50%)';
});

arrowLeft.addEventListener('click', () => {
  if (isMobile()) pokedex.style.transform = 'translateX(0)';
});
