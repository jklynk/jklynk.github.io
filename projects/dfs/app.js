document.addEventListener('DOMContentLoaded', () => {
    let users = [];
    let currentUser = null;

    let events = []; // This will hold our events after fetching
    let newEventInvites = []; // Temp array for invited users of the new event

    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    const activeTransmissionsList = document.getElementById('active-transmissions-list');
    const incomingSignalsList = document.getElementById('incoming-signals-list');
    const archivedEventsList = document.getElementById('archived-events-list');
    const createEventForm = document.getElementById('create-event-form');
    const galaxyGrid = document.getElementById('galaxy-grid');
    const addInviteBtn = document.getElementById('add-invite-btn');
    const invitesContainer = document.getElementById('invites-container');
    const inviteUsernameInput = document.getElementById('invite-username');
    const autocompleteResults = document.getElementById('autocomplete-results');


    // Helper function to format date and time
    function formatDateTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const options = {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    }


    // Function to render the dashboard
    function renderDashboard() {
        // Clear existing lists
        activeTransmissionsList.innerHTML = '';
        incomingSignalsList.innerHTML = '';
        archivedEventsList.innerHTML = '';

        events.forEach(event => {
            const currentUserAttendance = event.attendees.find(a => a.username === currentUser.username);

            // If the current user is not involved in the event, skip it.
            if (!currentUserAttendance) {
                return;
            }

            const eventElement = document.createElement('div');
            eventElement.classList.add('card');

            let buttonHtml = '';
            let listToAppend = null;

            if (event.status === 'archived') {
                buttonHtml = `<button class="btn-small" onclick="showEventDetail(${event.id})">VIEW EVENT DETAILS</button>`;
                listToAppend = archivedEventsList;
            } else if (currentUserAttendance.status === 'host') {
                buttonHtml = `<button class="btn-small" onclick="showEventDetail(${event.id})">MANAGE EVENT</button>`;
                listToAppend = activeTransmissionsList;
            } else {
                buttonHtml = `<button class="btn-small" onclick="showEventDetail(${event.id})">VIEW EVENT DETAILS</button>`;
                listToAppend = incomingSignalsList;
            }

            // Determine the user-centric status display
            let userStatusHtml = '';
            if (event.status === 'archived') {
                // For archived events, we can keep the simple 'archived' status
                userStatusHtml = `<span class="status archived">ARCHIVED</span>`;
            } else if (currentUserAttendance.status === 'host') {
                userStatusHtml = `<span class="status hosting">HOSTING</span>`;
            } else if (currentUserAttendance.status === 'confirmed') {
                userStatusHtml = `<span class="status confirmed">CONFIRMED</span>`;
            } else if (currentUserAttendance.status === 'pending') {
                userStatusHtml = `<span class="status pending">PENDING</span>`;
            }

            const formattedDateTime = event.dateTime ? formatDateTime(event.dateTime).toUpperCase() : 'TBD';
            const currentAttendeeCount = event.attendees.length; // Get live count
            eventElement.innerHTML = `
                <div class="card-header">
                    <span>${event.name}</span>
                    ${userStatusHtml}
                </div>
                <span class="event-meta">${formattedDateTime}</span>
                <span class="event-meta">LOC: ${event.location} // ${currentAttendeeCount}/${event.maxCap} ATTENDEES</span>
                ${buttonHtml}
            `;

            if (listToAppend) {
                listToAppend.appendChild(eventElement);
            }
        });
    }

    // Function to render the public Galaxy archive
    function renderGalaxy() {
        galaxyGrid.innerHTML = '';

        const archivedEvents = events.filter(event => event.status === 'archived');

        archivedEvents.forEach(event => {
            const archiveElement = document.createElement('div');
            archiveElement.classList.add('card');
            archiveElement.innerHTML = `
                <div class="card-header">
                    <span>${event.name}</span>
                    <span class="status archived">ARCHIVED</span>
                </div>
                <button class="btn-small" data-event-id="${event.id}">VIEW ARCHIVE</button>
            `;
            galaxyGrid.appendChild(archiveElement);
        });

        // Add listeners for all archive buttons
        const archiveButtons = galaxyGrid.querySelectorAll('button[data-event-id]');
        archiveButtons.forEach(button => {
            const eventId = button.dataset.eventId;
            let archiveUrl = '';

            switch (eventId) {
                case '3':
                    archiveUrl = 'archive-create-a-thon.html';
                    break;
                case '8':
                    archiveUrl = 'archive-firewall-gathering.html';
                    break;
                case '9':
                    archiveUrl = 'archive-node-cluster-01.html';
                    break;
                case '10':
                    archiveUrl = 'archive-project-chimera.html';
                    break;
            }
            if (archiveUrl) button.onclick = () => { window.location.href = archiveUrl; };
        });
    }

    // Make this function global so inline onclick can find it
    window.showEventDetail = function(eventId) {
        const event = events.find(e => e.id === eventId);
        if (!event) return;

        // Populate the event detail view
        document.getElementById('event-detail-signal').textContent = `SIGNAL: ${event.status.toUpperCase()}`;
        document.getElementById('event-detail-location').textContent = `LOC: ${event.location}`;
        document.getElementById('event-detail-name').textContent = `EVENT: ${event.name}`;
        document.getElementById('event-detail-datetime').textContent = event.dateTime ? formatDateTime(event.dateTime).toUpperCase() : '';
        const userActionsContainer = document.getElementById('event-user-actions');
        userActionsContainer.innerHTML = ''; // Clear previous actions

        const currentUserAttendance = event.attendees.find(a => a.username === currentUser.username);

        // If current user has a pending invite, show the accept button
        if (currentUserAttendance && currentUserAttendance.status === 'pending') {
            const acceptCard = document.createElement('div');
            acceptCard.className = 'card';
            acceptCard.innerHTML = `<button class="btn" onclick="handleAcceptInvite(${eventId})">ACCEPT INVITATION</button>`;
            userActionsContainer.appendChild(acceptCard);
        }

        // --- HOST CONTROLS ---
        const hostControlsSection = document.getElementById('host-controls-section');
        const secondaryInviteToggle = document.getElementById('event-detail-secondary-toggle');
        const secondaryInviteLabel = document.querySelector('label[for="event-detail-secondary-toggle"]');

        if (currentUserAttendance && currentUserAttendance.status === 'host') {
            hostControlsSection.style.display = 'block';
            secondaryInviteToggle.checked = event.allowSecondaryInvites;
            secondaryInviteLabel.classList.toggle('toggle-active', event.allowSecondaryInvites);

            // Use .onchange to easily re-assign for the current event context
            secondaryInviteToggle.onchange = () => {
                event.allowSecondaryInvites = secondaryInviteToggle.checked;
                localStorage.setItem('darkForestEvents', JSON.stringify(events));
                // Re-render to show/hide secondary invite section for others instantly
                showEventDetail(eventId);
            };
        } else {
            hostControlsSection.style.display = 'none';
        }

        // Show secondary invite section if applicable
        const secondaryInviteSection = document.getElementById('secondary-invite-section');
        const noInvitePrompt = document.getElementById('no-invite-permission-prompt');
        // Only hosts (level 0) and primary invitees (level 1) can invite.
        const canInvite = currentUserAttendance && (currentUserAttendance.level === 0 || (currentUserAttendance.level === 1 && currentUserAttendance.status === 'confirmed'));

        if (event.allowSecondaryInvites && canInvite) {
            secondaryInviteSection.style.display = 'block';
            noInvitePrompt.style.display = 'none';
            const secondaryInviteBtn = document.getElementById('add-secondary-invite-btn');
            // Use .onclick to easily re-assign it for the current event context
            secondaryInviteBtn.onclick = () => handleSecondaryInvite(eventId);
        } else {
            secondaryInviteSection.style.display = 'none';
            // Show prompt if user is an attendee but cannot invite
            const isAttendee = currentUserAttendance && currentUserAttendance.status !== 'host';
            noInvitePrompt.style.display = isAttendee ? 'block' : 'none';
        }

        // Autocomplete for secondary invites
        const secondaryInviteInput = document.getElementById('secondary-invite-username');
        const secondaryAutocompleteResults = document.getElementById('secondary-autocomplete-results');
        secondaryInviteInput.addEventListener('input', () => {
            const query = secondaryInviteInput.value;
            const existingUsernames = event.attendees.map(a => a.username);
            renderAutocomplete(query, secondaryInviteInput, secondaryAutocompleteResults, existingUsernames);
        });
        // Clear results when input loses focus
        secondaryInviteInput.addEventListener('blur', () => {
            setTimeout(() => { // Timeout to allow click to register
                secondaryAutocompleteResults.innerHTML = '';
            }, 200);
        });


        // Populate the manifest list
        const manifestContent = document.getElementById('event-detail-manifest');
        manifestContent.innerHTML = ''; // Clear previous content

        // Update cap display to be reflective of manifest length
        const currentAttendeeCount = event.attendees.length;
        document.getElementById('event-detail-cap').innerHTML = `<span>Cap (${currentAttendeeCount}/${event.maxCap})</span>`;

        // Show waitlist alert only when full
        const waitlistAlert = document.getElementById('waitlist-alert');
        waitlistAlert.style.display = currentAttendeeCount >= event.maxCap ? 'block' : 'none';

        // Show host message section only for host
        const hostMessageSection = document.getElementById('host-message-section');
        hostMessageSection.style.display = (currentUserAttendance && currentUserAttendance.status === 'host') ? 'block' : 'none';

        event.attendees.forEach(roleInfo => {
            const roleEl = document.createElement('div');
            roleEl.style.marginBottom = '8px';
            // Use the new simplified status
            roleEl.innerHTML = `<span class="role-badge">${roleInfo.status.toUpperCase()}</span> ${roleInfo.username}`;
            manifestContent.appendChild(roleEl);
        });

        // --- ARCHIVE CONTRIBUTION PANEL ---
        const archivePanel = document.getElementById('archive-contribution-panel');
        const canContribute = currentUserAttendance && (currentUserAttendance.status === 'host' || currentUserAttendance.status === 'confirmed');
        archivePanel.style.display = canContribute ? 'block' : 'none';

        // Switch to the event detail view
        switchView('event-detail');
    }

    // Make this function global so inline onclick can find it
    window.handleAcceptInvite = function(eventId) {
        // Find the event and the attendee record
        const event = events.find(e => e.id === eventId);
        if (!event) return;

        const attendee = event.attendees.find(a => a.username === currentUser.username);
        if (!attendee || attendee.status !== 'pending') return;

        // Update status
        attendee.status = 'confirmed';

        // Save changes to localStorage
        localStorage.setItem('darkForestEvents', JSON.stringify(events));

        // Re-render the detail view to reflect the change
        showEventDetail(eventId);
    }

    // Function to handle secondary invites
    function handleSecondaryInvite(eventId) {
        const usernameInput = document.getElementById('secondary-invite-username');
        const username = usernameInput.value;

        const event = events.find(e => e.id === eventId);
        if (!event) return;

        // Validation
        const userExists = users.some(u => u.username === username);
        const alreadyAttending = event.attendees.some(a => a.username === username);

        if (userExists && !alreadyAttending && event.attendees.length < event.maxCap) {
            // Determine the level of the new invitee.
            // If the host (level 0) invites, the new person is level 1.
            // If a primary invitee (level 1) invites, the new person is level 2.
            const inviter = event.attendees.find(a => a.username === currentUser.username);
            const newLevel = inviter.level === 0 ? 1 : 2;

            event.attendees.push({ username: username, status: 'pending', level: newLevel });
            localStorage.setItem('darkForestEvents', JSON.stringify(events));
            showEventDetail(eventId); // Re-render to show the new pending user
            usernameInput.value = ''; // Clear input
        } else {
            // Optional: provide feedback for invalid invite
            usernameInput.value = '';
            console.log("Secondary invite failed: User does not exist, is already attending, or event is full.");
        }
    }

    // Function to switch views
    function switchView(viewId) {
        // Update views
        views.forEach(view => {
            view.classList.remove('active');
        });
        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.classList.add('active');
        }

        // Update nav buttons
        navButtons.forEach(button => {
            button.classList.remove('active');
            if (button.dataset.view === viewId) {
                button.classList.add('active');
            }
        });
    }

    // Function to handle new event creation
    function handleCreateEvent(e) {
        e.preventDefault(); // Prevent the form from actually submitting

        // Get values from the form
        const eventName = document.getElementById('event-codename').value;

        // 1. Check for duplicate codenames
        if (events.some(event => event.name.toUpperCase() === eventName.toUpperCase())) {
            alert(`Error: An event with the codename "${eventName}" already exists.`);
            return; // Stop the function
        }

        const eventDateTime = document.getElementById('event-datetime').value;
        const eventLocation = document.getElementById('event-location').value;
        const eventCapacity = parseInt(document.getElementById('event-capacity').value);
        const allowSecondaryInvites = document.getElementById('secondary-invites-toggle').checked;

        // Create a new event object
        // The creator is the host, others are added as attendees.
        const newEvent = {
            id: events.length > 0 ? Math.max(...events.map(e => e.id)) + 1 : 1, // Generate a new unique ID
            name: eventName.toUpperCase(),
            status: 'upcoming',
            dateTime: eventDateTime,
            location: `ENCRYPTED: ${eventLocation}`,
            // attendeeCount is now derived from attendees.length
            maxCap: eventCapacity,
            allowSecondaryInvites: allowSecondaryInvites,
            attendees: [{ username: currentUser.username, status: 'host', level: 0 }, ...newEventInvites] // The creator is the current user
        };

        // Add the new event to our array
        events.push(newEvent);

        // Save the updated array to localStorage
        localStorage.setItem('darkForestEvents', JSON.stringify(events));

        // Re-render the dashboard to show the new event
        renderDashboard();

        // Switch back to the dashboard view
        switchView('dashboard');

        // Reset the form for the next use
        createEventForm.reset();
        invitesContainer.innerHTML = '';
        newEventInvites = [];
    }

    // Function to handle adding an invite tag
    function handleAddInvite() {
        const usernameInput = document.getElementById('invite-username');
        const username = usernameInput.value;
        autocompleteResults.innerHTML = ''; // Clear autocomplete

        // Basic validation: user exists and is not already invited
        const userExists = users.some(u => u.username === username);
        const alreadyInvited = newEventInvites.some(i => i.username === username);
        if (!userExists || alreadyInvited) {
            usernameInput.value = ''; // Clear invalid input
            return;
        }

        // Add user to our temp invites array with a 'pending' status
        newEventInvites.push({ username: username, status: 'pending', level: 1 });

        // Create and display the tag
        const roleTag = document.createElement('span');
        roleTag.className = 'role-badge';
        roleTag.textContent = username;
        invitesContainer.appendChild(roleTag);

        // Clear the username input for the next entry
        usernameInput.value = '';
    }

    // Autocomplete rendering function
    function renderAutocomplete(query, inputElement, resultsContainer, excludedUsers = []) {
        resultsContainer.innerHTML = '';
        if (query.length < 2) {
            return;
        }

        const filteredUsers = users.filter(user =>
            user.username.toLowerCase().includes(query.toLowerCase()) &&
            user.username !== currentUser.username && // Can't invite yourself
            !excludedUsers.includes(user.username) // Don't show already invited/attending users
        );

        filteredUsers.forEach(user => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = user.username;
            div.addEventListener('mousedown', () => { // Use mousedown to fire before blur
                inputElement.value = user.username;
                resultsContainer.innerHTML = '';
            });
            resultsContainer.appendChild(div);
        });
    }

    // --- EVENT LISTENERS ---

    // Add click listeners to nav buttons
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchView(button.dataset.view);
        });
    });

    // Add listener for the create event form
    createEventForm.addEventListener('submit', handleCreateEvent);

    // Add listener for the add invite button
    addInviteBtn.addEventListener('click', handleAddInvite);

    // Add listener for primary invite autocomplete
    inviteUsernameInput.addEventListener('input', () => {
        const query = inviteUsernameInput.value;
        const existingUsernames = newEventInvites.map(i => i.username);
        renderAutocomplete(query, inviteUsernameInput, autocompleteResults, existingUsernames);
    });
    // Clear results when input loses focus
    inviteUsernameInput.addEventListener('blur', () => {
        setTimeout(() => { // Timeout to allow click to register
            autocompleteResults.innerHTML = '';
        }, 200);
    });

    function renderUserSwitcher() {
        const userSelect = document.getElementById('user-select-dropdown');
        userSelect.innerHTML = ''; // Clear existing options

        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = user.username;
            if (currentUser && user.username === currentUser.username) {
                option.selected = true;
            }
            userSelect.appendChild(option);
        });

        userSelect.addEventListener('change', (e) => {
            const selectedUsername = e.target.value;
            const selectedUser = users.find(u => u.username === selectedUsername);
            localStorage.setItem('darkForestCurrentUser', JSON.stringify(selectedUser));
            window.location.reload(); // Reload to apply the new user context
        });
    }

    // Add listener for the back to dashboard button
    document.getElementById('back-to-dashboard').addEventListener('click', () => switchView('dashboard'));

    // Function to initialize the app
    function initialize() {
        Promise.all([
            fetch('users.json').then(res => res.json()),
            fetch('events.json').then(res => res.json())
        ]).then(([userData, eventData]) => {
            // 1. Set up users
            users = userData;
            const savedUser = localStorage.getItem('darkForestCurrentUser');
            // Check if saved user is still valid, otherwise default
            const foundUser = savedUser ? users.find(u => u.username === JSON.parse(savedUser).username) : null;

            if (foundUser) {
                currentUser = foundUser;
            } else {
                currentUser = users[0]; // Default to the first user
                localStorage.setItem('darkForestCurrentUser', JSON.stringify(currentUser));
            }
            renderUserSwitcher();

            // 2. Set up events
            const savedEvents = localStorage.getItem('darkForestEvents');
            if (savedEvents) {
                events = JSON.parse(savedEvents);
            } else {
                events = eventData;
                localStorage.setItem('darkForestEvents', JSON.stringify(events));
            }
            renderDashboard();
            renderGalaxy();

            // 3. Set initial view
            switchView('dashboard');

        }).catch(error => console.error('Error initializing app:', error));
    }

    initialize();
});