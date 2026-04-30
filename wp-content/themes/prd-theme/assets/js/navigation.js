document.addEventListener('DOMContentLoaded', function() {
    var toggle = document.querySelector('.hdr__toggle');
    var nav = document.querySelector('.hdr__nav');
    var openIcon = document.querySelector('.hdr__toggle-open');
    var closeIcon = document.querySelector('.hdr__toggle-close');

    if (toggle && nav) {
        toggle.addEventListener('click', function() {
            var expanded = nav.classList.toggle('active');
            toggle.setAttribute('aria-expanded', expanded);
            if (openIcon) openIcon.style.display = expanded ? 'none' : '';
            if (closeIcon) closeIcon.style.display = expanded ? '' : 'none';
        });

        nav.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                nav.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                if (openIcon) openIcon.style.display = '';
                if (closeIcon) closeIcon.style.display = 'none';
            });
        });
    }

    // Scroll-based header background
    var header = document.getElementById('site-header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }, { passive: true });
    }
});
