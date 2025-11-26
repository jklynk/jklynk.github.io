document.addEventListener('DOMContentLoaded', () => {

    // --- 1. CONFIGURATION ---
    const container = document.getElementById('garden-container');
    let allData = [];
    let iso;

    // --- 2. DATA FETCHING & INITIALIZATION ---
    fetch('data.json')
    .then(response => response.json())
    .then(data => {
        allData = data;
        // Sort data by year (descending) instead of shuffling
        allData.sort((a, b) => {
            const yearA = getYearFromTags(a);
            const yearB = getYearFromTags(b);

            if (yearB && !yearA) return 1;  // b has a year, a doesn't, so b comes first
            if (yearA && !yearB) return -1; // a has a year, b doesn't, so a comes first
            return yearB - yearA; // Sort by year descending
        });
        renderCards(allData);
    })
    .catch(error => console.error('Error loading garden:', error));

    // --- 3. CORE FUNCTIONS ---

    function renderCards(data) {
    container.innerHTML = ''; // Clear existing content

    // Create a document fragment to hold the cards before appending to the DOM
    const fragment = document.createDocumentFragment();

    data.forEach((item, index) => {
        // Create the Card Div
        const card = document.createElement('div');
        const tagClasses = item.tags.map(tag => sanitizeForClassName(tag)).join(' ');
        card.className = `card ${item.category} ${tagClasses}`;

        // Build the Image (if it exists)
        let imageSrc = item.image; // Start with the default image from JSON

        // If no image is provided, try to generate one from a YouTube link
        if (!imageSrc && item.link && (item.link.includes('youtube.com') || item.link.includes('youtu.be'))) {
            const videoId = getYouTubeID(item.link);
            if (videoId) {
                imageSrc = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        }
        const imageHTML = imageSrc ? `<img src="${imageSrc}" alt="${item.title}">` : '';

        // Build the Tags
        const tagsHTML = item.tags.map(tag => `<span onclick="filterByTag(event, '${tag}')">${tag}</span>`).join('');

        // A link is only "real" if it exists and is not just a placeholder '#'.
        const hasRealLink = item.link && item.link.trim() !== '' && item.link.trim() !== '#';

        const cardContentHTML = !hasRealLink && item.content.includes('\n\n')
            ? parseForReadMore(item.content)
            : parseContentForCardPreview(item.content);

        // Put it all together
        card.innerHTML = `
            ${imageHTML}
            <h2>${item.title}</h2>
            <div class="card-content-body">${cardContentHTML}</div>
            <div class="tags">${tagsHTML}</div>
        `;

        card.classList.add('interactive');

        card.addEventListener('click', () => {
            if (hasRealLink && item.link.startsWith('http')) {
                window.open(item.link, '_blank', 'noopener,noreferrer');
            } else if (hasRealLink) {
                window.location.href = item.link;
            }
        });

        const readMoreBtn = card.querySelector('.read-more-btn');
        if (readMoreBtn) {
            readMoreBtn.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevents the card's main click listener from firing.
                const expandableContent = card.querySelector('.card-expandable-content');
                const isExpanded = expandableContent.classList.toggle('expanded');
                readMoreBtn.textContent = isExpanded ? 'read less' : 'read more';
                expandableContent.addEventListener('transitionend', () => {
                    iso.layout();
                }, { once: true });
            });
        }

        fragment.appendChild(card);
    });

    // Add sizers back in before appending cards
    const sizer = document.createElement('div'); sizer.className = 'grid-sizer';
    const gutterSizer = document.createElement('div'); gutterSizer.className = 'gutter-sizer';
    container.appendChild(sizer);
    container.appendChild(gutterSizer);
    container.appendChild(fragment);

    imagesLoaded(container, () => {
        iso = new Isotope(container, {
            itemSelector: '.card',
            layoutMode: 'masonry',
            percentPosition: true,
            masonry: {
                columnWidth: '.grid-sizer',
                gutter: '.gutter-sizer',
                horizontalOrder: false
            }
        });
    });
    }

    function parseForReadMore(content) {
        const paragraphs = content.split('\n\n');
        const firstParagraph = parseContentToHTML(paragraphs[0]);
        const restOfContent = parseContentToHTML(paragraphs.slice(1).join('\n\n'));
        return `
        ${firstParagraph}
        <div class="card-expandable-content">${restOfContent}</div>
        <button class="read-more-btn">read more</button>
    `;
}


    function parseContentForCardPreview(content) {
        const paragraphs = content.split('\n\n');
        return parseContentToHTML(paragraphs[0]);
    }

    function parseContentToHTML(content) {
        if (!content) return '';

        // Regex to find markdown-style links: [text](url)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const linkReplacer = '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>';

        return content
            .split('\n\n')
            .map(paragraph => {
                const trimmed = paragraph.trim();
                if (trimmed.startsWith('> ')) {
                    const blockquoteContent = trimmed.substring(2).replace(linkRegex, linkReplacer);
                    return `<blockquote>${blockquoteContent}</blockquote>`;
                }
                return `<p>${trimmed.replace(linkRegex, linkReplacer)}</p>`;
            }).join('');
    }

    // --- 4. GLOBAL FILTER FUNCTIONS ---

    window.filterData = function(category) {
        document.querySelectorAll('.filter-bar button').forEach(btn => {
        if (btn.getAttribute('onclick') === `filterData('${category}')`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const filterValue = category === 'all' ? '*' : `.${category}`;
    iso.arrange({ filter: filterValue });
    }

    window.filterByTag = function(event, tag) {
        event.stopPropagation();
        document.querySelectorAll('.filter-bar button').forEach(btn => btn.classList.remove('active'));
        const filterValue = `.${sanitizeForClassName(tag)}`;
        iso.arrange({ filter: filterValue });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- 5. HELPER FUNCTIONS ---

    function getYearFromTags(item) {
        if (!item.tags || item.tags.length === 0) return null;
        const yearTag = item.tags.find(tag => /^\d{4}$/.test(tag.trim()));
        return yearTag ? parseInt(yearTag, 10) : null;
    }

    function sanitizeForClassName(name) {
        return name
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '');
    }

    /**
     * Extracts the YouTube video ID from a URL.
     * @param {string} url The YouTube URL.
     * @returns {string|null} The video ID or null if not found.
     */
    function getYouTubeID(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
        return null;
    }

});