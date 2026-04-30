document.addEventListener('DOMContentLoaded', function() {
    // FAQ accordion
    document.querySelectorAll('.faq-row__q').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var row = btn.closest('.faq-row');
            var wasOpen = row.classList.contains('open');
            document.querySelectorAll('.faq-row').forEach(function(r) {
                r.classList.remove('open');
                r.querySelector('.faq-row__q').setAttribute('aria-expanded', 'false');
            });
            if (!wasOpen) {
                row.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
        a.addEventListener('click', function(e) {
            var target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
