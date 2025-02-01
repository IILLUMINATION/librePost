// Firebase конфигурация
const firebaseConfig = {
    apiKey: "AIzaSyBJ6H3FfBCkE3qcYg3sL3QBEHh5rjNxv9M",
    authDomain: "telegrapg-aa4b5.firebaseapp.com",
    databaseURL: "https://telegrapg-aa4b5-default-rtdb.firebaseio.com",
    projectId: "telegrapg-aa4b5",
    storageBucket: "telegrapg-aa4b5.appspot.com",
    messagingSenderId: "7091771738",
    appId: "1:7091771738:web:c7229f0e9e23c2e6f6e28d"
};

// ImgBB конфигурация
const imgbbConfig = {
    apiKey: "43f96afa5ef894f157431a165e455419"
};

// Глобальные переменные
let isLoading = false;
let uploadedPhotos = new Map();
let currentPost = null;
let database = null;
let auth = null;

// DOM элементы
const editor = document.getElementById('editor');
const editorToolbar = document.getElementById('editorToolbar');
const logo = document.querySelector('.logo');
const createPostBtn = document.getElementById('createPostBtn');
const createPostModal = document.getElementById('createPostModal');
const closeButtons = document.querySelectorAll('.close-btn');
const submitPostBtn = document.getElementById('submitPost');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const sortSelect = document.getElementById('sortSelect');
const themeToggle = document.getElementById('themeToggle');

let currentSort = 'date'; // date, views, comments
let currentTheme = localStorage.getItem('theme') || 'dark';

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Initializing Firebase with config:', firebaseConfig);
        // Инициализация Firebase
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        auth = firebase.auth();

        // Анонимная аутентификация
        await auth.signInAnonymously();

        // Обработчик состояния аутентификации
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('Anonymous user signed in:', user.uid);
                // После успешной аутентификации проверяем подключение
                database.ref('.info/connected').on('value', function(snapshot) {
                    if (snapshot.val() === true) {
                        console.log('Connected to Firebase');
                        loadPosts(); // Загружаем посты после успешного подключения
                    } else {
                        console.error('No Firebase connection');
                        const postsContainer = document.getElementById('postsContainer');
                        if (postsContainer) {
                            postsContainer.innerHTML = '<div class="error">Нет подключения к базе данных</div>';
                        }
                    }
                });
            } else {
                console.error('User signed out');
                const postsContainer = document.getElementById('postsContainer');
                if (postsContainer) {
                    postsContainer.innerHTML = '<div class="error">Ошибка аутентификации</div>';
                }
            }
        });

        // Инициализация темы
        document.body.className = currentTheme + '-theme';
        updateThemeIcon();
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        const postsContainer = document.getElementById('postsContainer');
        if (postsContainer) {
            postsContainer.innerHTML = '<div class="error">Ошибка инициализации Firebase</div>';
        }
    }
});

// Обработчик смены темы
themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = currentTheme + '-theme';
    localStorage.setItem('theme', currentTheme);
    updateThemeIcon();
});

// Функция обновления иконки темы
function updateThemeIcon() {
    const icon = themeToggle.querySelector('i');
    icon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Обработчик поиска
searchInput.addEventListener('input', debounce(() => {
    loadPosts(searchInput.value);
}, 300));

searchBtn.addEventListener('click', () => {
    loadPosts(searchInput.value);
});

// Обработчик сортировки
sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    loadPosts(searchInput.value);
});

// Функция debounce для оптимизации поиска
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Обработчик клика по логотипу
logo.addEventListener('click', () => {
    mainContent.innerHTML = '';
    history.pushState({}, '', '/');
    loadPosts();
});

// Обработчик кнопки "назад" в браузере
window.addEventListener('popstate', () => {
    const params = getUrlParams();
    if (!params.postId) {
        loadPosts();
    }
});

// Функция загрузки постов
function loadPosts(searchQuery = '') {
    const params = getUrlParams();
    
    if (isLoading) return;
    isLoading = true;
    
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) {
        console.error('Не найден контейнер для статей');
        return;
    }
    
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'spinner';
    postsContainer.appendChild(loadingIndicator);
    
    let query = database.ref('posts').orderByChild('timestamp');
    
    query.once('value')
        .then(snapshot => {
            const posts = [];
            snapshot.forEach(childSnapshot => {
                const post = childSnapshot.val();
                post.id = childSnapshot.key;
                posts.push(post);
            });
            
            // Если есть параметр id в URL, показываем конкретный пост
            if (params.postId) {
                const post = posts.find(p => p.id === params.postId);
                if (post) {
                    showPost(post);
                    return;
                }
            }
            
            // Фильтрация по поисковому запросу
            let filteredPosts = searchQuery
                ? posts.filter(post =>
                    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    stripHtml(post.content).toLowerCase().includes(searchQuery.toLowerCase())
                )
                : posts;
            
            // Сортировка
            filteredPosts.sort((a, b) => {
                switch (currentSort) {
                    case 'date':
                        return b.timestamp - a.timestamp;
                    case 'views':
                        return (b.views || 0) - (a.views || 0);
                    case 'comments':
                        const commentsA = Object.keys(a.comments || {}).length;
                        const commentsB = Object.keys(b.comments || {}).length;
                        return commentsB - commentsA;
                    default:
                        return b.timestamp - a.timestamp;
                }
            });
            
            postsContainer.innerHTML = ''; // Очищаем после получения данных
            
            if (filteredPosts.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = searchQuery
                    ? 'По вашему запросу ничего не найдено'
                    : 'Нет доступных статей';
                postsContainer.appendChild(noResults);
            } else {
                filteredPosts.forEach(post => {
                    const postCard = createPostCard(post);
                    postsContainer.appendChild(postCard);
                });
            }
        })
        .catch(error => {
            console.error('Ошибка при загрузке статей:', error);
            postsContainer.innerHTML = '<div class="error">Ошибка при загрузке статей</div>';
        })
        .finally(() => {
            isLoading = false;
            const spinner = postsContainer.querySelector('.spinner');
            if (spinner) spinner.remove();
        });
}

// Функция для получения параметров URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        postId: params.get('id')
    };
}

// Функция для удаления HTML тегов из текста
function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Функция для создания карточки поста
function createPostCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';
    
    // Проверяем, жаловался ли пользователь на этот пост
    const reportedPosts = JSON.parse(localStorage.getItem('reportedPosts') || '[]');
    const isReported = reportedPosts.includes(post.id);
    
    // Получаем текст без HTML тегов и обрезаем до 150 символов
    const excerpt = stripHtml(post.content).substring(0, 150) + '...';
    
    card.innerHTML = `
        <div class="post-thumbnail">
            <i class="fas fa-newspaper"></i>
        </div>
        <div class="post-info">
            <h2 class="post-title">${post.title || 'Без названия'}</h2>
            <p class="post-excerpt">${excerpt}</p>
            <div class="post-meta">
                <span>${new Date(post.timestamp).toLocaleDateString()}</span>
                <div class="post-stats">
                    <span><i class="fas fa-eye"></i> ${post.views || 0}</span>
                    <span><i class="fas fa-heart"></i> ${post.reactions?.like || 0}</span>
                </div>
            </div>
        </div>
        <div class="post-actions">
            <button class="report-btn icon-btn ${isReported ? 'reported' : ''}" 
                    title="${isReported ? 'Вы уже пожаловались' : 'Пожаловаться'}"
                    ${isReported ? 'disabled' : ''}>
                <i class="fas fa-flag"></i>
            </button>
        </div>
    `;
    
    // Добавляем обработчик для кнопки жалобы
    if (!isReported) {
        const reportBtn = card.querySelector('.report-btn');
        reportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Вы действительно хотите пожаловаться на эту статью?')) {
                reportPost(post.id);
                reportBtn.classList.add('reported');
                reportBtn.disabled = true;
                reportBtn.title = 'Вы уже пожаловались';
            }
        });
    }
    
    // Добавляем обработчик клика для перехода к посту
    card.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('id', post.id);
        window.history.pushState({}, '', url);
        showPost(post);
    });
    
    return card;
}

// Обработчик клика по логотипу
logo.addEventListener('click', () => {
    mainContent.innerHTML = '';
    history.pushState({}, '', '/');
    loadPosts();
});

// Обработчик кнопки "назад" в браузере
window.addEventListener('popstate', () => {
    const params = getUrlParams();
    if (!params.postId) {
        loadPosts();
    }
});

// Функция создания карточки поста
function createPostCard(post) {
    const card = document.createElement('div');
    card.className = 'post-card';
    
    // Получаем текст без HTML тегов и обрезаем до 150 символов
    const excerpt = stripHtml(post.content).substring(0, 150) + '...';
    
    card.innerHTML = `
        <div class="post-thumbnail">
            <i class="fas fa-newspaper"></i>
        </div>
        <div class="post-info">
            <h2 class="post-title">${post.title || 'Без названия'}</h2>
            <p class="post-excerpt">${excerpt}</p>
            <div class="post-meta">
                <span>${new Date(post.timestamp).toLocaleDateString()}</span>
                <div class="post-stats">
                    <span><i class="fas fa-eye"></i> ${post.views || 0}</span>
                    <span><i class="fas fa-heart"></i> ${post.reactions?.like || 0}</span>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем обработчик клика для перехода к посту
    card.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('id', post.id);
        window.history.pushState({}, '', url);
        showPost(post);
    });
    
    return card;
}

// Загрузка статей
function loadPosts(searchQuery = '') {
    const params = getUrlParams();
    
    if (isLoading) return;
    isLoading = true;
    
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) {
        console.error('Не найден контейнер для статей');
        return;
    }
    
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'spinner';
    postsContainer.appendChild(loadingIndicator);
    
    let query = database.ref('posts').orderByChild('timestamp');
    
    query.once('value')
        .then(snapshot => {
            const posts = [];
            snapshot.forEach(childSnapshot => {
                const post = childSnapshot.val();
                post.id = childSnapshot.key;
                posts.push(post);
            });
            
            // Если есть параметр id в URL, показываем конкретный пост
            if (params.postId) {
                const post = posts.find(p => p.id === params.postId);
                if (post) {
                    showPost(post);
                    return;
                }
            }
            
            // Фильтрация по поисковому запросу
            let filteredPosts = searchQuery
                ? posts.filter(post =>
                    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    stripHtml(post.content).toLowerCase().includes(searchQuery.toLowerCase())
                )
                : posts;
            
            // Сортировка
            filteredPosts.sort((a, b) => {
                switch (currentSort) {
                    case 'date':
                        return b.timestamp - a.timestamp;
                    case 'views':
                        return (b.views || 0) - (a.views || 0);
                    case 'comments':
                        const commentsA = Object.keys(a.comments || {}).length;
                        const commentsB = Object.keys(b.comments || {}).length;
                        return commentsB - commentsA;
                    default:
                        return b.timestamp - a.timestamp;
                }
            });
            
            postsContainer.innerHTML = ''; // Очищаем после получения данных
            
            if (filteredPosts.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = searchQuery
                    ? 'По вашему запросу ничего не найдено'
                    : 'Нет доступных статей';
                postsContainer.appendChild(noResults);
            } else {
                filteredPosts.forEach(post => {
                    const postCard = createPostCard(post);
                    postsContainer.appendChild(postCard);
                });
            }
        })
        .catch(error => {
            console.error('Ошибка при загрузке статей:', error);
            postsContainer.innerHTML = '<div class="error">Ошибка при загрузке статей</div>';
        })
        .finally(() => {
            isLoading = false;
            const spinner = postsContainer.querySelector('.spinner');
            if (spinner) spinner.remove();
        });
}

// Функция для получения параметров URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        postId: params.get('id')
    };
}

// Функция для удаления HTML тегов из текста
function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Функция для замены тегов фотографий на изображения
function replacePhotoTags(content) {
    if (!content) return '';
    
    console.log('Replacing photo tags in content:', content);
    console.log('Current post photos:', currentPost?.photos);
    console.log('Uploaded photos:', Array.from(uploadedPhotos.entries()));
    
    // Регулярное выражение для поиска тегов фото: [photo_TIMESTAMP_RANDOM]
    const photoTagRegex = /\[photo_\d+_[a-z0-9]+\]/g;
    
    // Заменяем каждый тег на соответствующее изображение
    return content.replace(photoTagRegex, tag => {
        // Получаем имя фото из тега (убираем квадратные скобки)
        const photoName = tag.slice(1, -1);
        console.log('Found photo tag:', photoName);
        
        let imageUrl = null;
        
        // Сначала проверяем в текущем посте
        if (currentPost?.photos && currentPost.photos[photoName]) {
            imageUrl = currentPost.photos[photoName];
            console.log('Found in current post:', imageUrl);
        }
        // Затем проверяем в uploadedPhotos
        else if (uploadedPhotos.has(photoName)) {
            imageUrl = uploadedPhotos.get(photoName);
            console.log('Found in uploaded photos:', imageUrl);
        }
        
        if (imageUrl) {
            return `
                <div class="article-image-container">
                    <img src="${imageUrl}" alt="${photoName}" class="article-image">
                </div>
            `;
        }
        
        console.log('Image not found for tag:', photoName);
        return ''; // Если изображение не найдено, возвращаем пустую строку
    });
}

// Функция для отображения поста
function showPost(post) {
    console.log('Showing post:', post);
    
    // Сохраняем текущий пост для доступа к фотографиям
    currentPost = post;
    
    // Восстанавливаем информацию о фотографиях
    if (post.photos) {
        console.log('Restoring photos from post:', post.photos);
        uploadedPhotos.clear();
        Object.entries(post.photos).forEach(([name, url]) => {
            uploadedPhotos.set(name, url);
            console.log('Restored photo:', name, url);
        });
    }
    
    const postContent = document.createElement('div');
    postContent.className = 'post-content';
    postContent.innerHTML = `
        <h1>${post.title}</h1>
        <div class="post-meta">
            <span>${new Date(post.timestamp).toLocaleDateString()}</span>
            <div class="post-stats">
                <span><i class="fas fa-eye"></i> ${post.views || 0}</span>
                <span><i class="fas fa-heart"></i> ${post.reactions?.like || 0}</span>
            </div>
        </div>
        ${replacePhotoTags(post.content)}
    `;
    
    const postsContainer = document.getElementById('postsContainer');
    if (postsContainer) {
        postsContainer.innerHTML = '';
        postsContainer.appendChild(postContent);
        
        // Обновляем просмотры после добавления контента
        updateViews(post.id);
    }
}

// Функция для обновления просмотров
function updateViews(postId) {
    // Получаем список просмотренных постов из localStorage
    const viewedPosts = JSON.parse(localStorage.getItem('viewedPosts') || '[]');
    
    // Если пост еще не просмотрен в этой сессии
    if (!viewedPosts.includes(postId)) {
        viewedPosts.push(postId);
        localStorage.setItem('viewedPosts', JSON.stringify(viewedPosts));
        
        // Обновляем счетчик в базе данных
        const postRef = database.ref(`posts/${postId}`);
        postRef.transaction(post => {
            if (post) {
                if (!post.views) post.views = 0;
                post.views++;
            }
            return post;
        });
    }
}

// Добавляем стили для изображений в статье
const articleImageStyles = document.createElement('style');
articleImageStyles.textContent = `
    .article-image-container {
        margin: 20px 0;
        text-align: center;
    }
    
    .article-image {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
`;
document.head.appendChild(articleImageStyles);

// Стили для фотографий
const photoStyles = document.createElement('style');
photoStyles.textContent = `
    .photos-section {
        margin-top: 20px;
        padding: 20px;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 5px;
    }
    
    .photos-section h3 {
        margin: 0 0 15px 0;
        color: var(--text-color);
    }
    
    .photos-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
    }
    
    .photo-preview {
        position: relative;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 5px;
        overflow: hidden;
    }
    
    .photo-preview img {
        width: 100%;
        height: 150px;
        object-fit: cover;
    }
    
    .photo-controls {
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--bg-color);
    }
    
    .photo-name {
        flex-grow: 1;
        font-size: 0.9em;
        color: var(--text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .photo-controls button {
        padding: 5px 10px;
        border: none;
        background: none;
        color: var(--text-color);
        cursor: pointer;
        opacity: 0.7;
    }
    
    .photo-controls button:hover {
        opacity: 1;
    }
    
    .photo-tag {
        display: inline-block;
        padding: 2px 6px;
        margin: 0 2px;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 3px;
        font-family: monospace;
        color: var(--text-color);
        cursor: default;
    }
`;
document.head.appendChild(photoStyles);

// Обработчик открытия модального окна создания поста
createPostBtn.addEventListener('click', () => {
    createPostModal.style.display = 'block';
    // Очищаем поля
    document.getElementById('postTitle').value = '';
    editor.innerHTML = '';
    document.getElementById('photosContainer').innerHTML = '';
    uploadedPhotos.clear();
    // Генерируем новую капчу
    generateCaptcha();
});

// Обработчики закрытия модальных окон
closeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const modal = button.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
        }
    });
});

// Закрытие модального окна при клике вне его
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        // Проверяем, не выделен ли текст
        const selection = window.getSelection();
        if (selection.toString().length === 0) {
            event.target.style.display = 'none';
        }
    }
});

// Обработчики инструментов редактора
editorToolbar.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const command = button.dataset.command;
        const value = button.dataset.value || null;
        
        if (command === 'formatBlock') {
            document.execCommand('formatBlock', false, value);
        } else {
            document.execCommand(command, false, value);
        }
        
        editor.focus();
    });
});

// Предотвращаем закрытие модального окна при клике внутри редактора
editor.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Предотвращаем закрытие модального окна при клике на панель инструментов
editorToolbar.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Предотвращаем закрытие модального окна при клике на форму
document.querySelector('.modal-content').addEventListener('click', (e) => {
    e.stopPropagation();
});

// Обработчик отправки формы
submitPostBtn.addEventListener('click', async () => {
    const title = document.getElementById('postTitle').value.trim();
    const content = editor.innerHTML;
    
    if (!title) {
        alert('Пожалуйста, введите заголовок статьи');
        return;
    }
    
    if (!content) {
        alert('Пожалуйста, введите содержание статьи');
        return;
    }
    
    const post = {
        title,
        content,
        timestamp: Date.now(),
        views: 0,
        reactions: { like: 0 },
        photos: Object.fromEntries(uploadedPhotos)
    };
    
    try {
        await database.ref('posts').push(post);
        createPostModal.style.display = 'none';
        loadPosts();
    } catch (error) {
        console.error('Ошибка при создании статьи:', error);
        alert('Произошла ошибка при сохранении статьи');
    }
});

// Капча
const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
let correctColor = '';

function generateCaptcha() {
    const colorGrid = document.getElementById('colorGrid');
    colorGrid.innerHTML = '';
    
    const shuffledColors = [...colors].sort(() => Math.random() - 0.5);
    correctColor = shuffledColors[Math.floor(Math.random() * colors.length)];
    
    document.getElementById('targetColor').textContent = 
        correctColor === 'yellow' ? 'жёлтого' :
        correctColor === 'red' ? 'красного' :
        correctColor === 'blue' ? 'синего' :
        correctColor === 'green' ? 'зелёного' :
        correctColor === 'purple' ? 'фиолетового' :
        'оранжевого';
    
    shuffledColors.forEach(color => {
        const square = document.createElement('div');
        square.className = 'color-square';
        square.style.backgroundColor = color;
        square.onclick = () => checkColor(color);
        colorGrid.appendChild(square);
    });
}

function checkColor(selectedColor) {
    const submitButton = document.getElementById('submitPost');
    const squares = document.querySelectorAll('.color-square');
    
    squares.forEach(square => square.style.border = 'none');
    
    if (selectedColor === correctColor) {
        submitButton.disabled = false;
        document.querySelector(`[style*="${selectedColor}"]`).style.border = '3px solid var(--success)';
    } else {
        submitButton.disabled = true;
        document.querySelector(`[style*="${selectedColor}"]`).style.border = '3px solid var(--error)';
        setTimeout(generateCaptcha, 1000);
    }
}

// Счетчики символов
const titleInput = document.getElementById('postTitle');
titleInput.addEventListener('input', function() {
    const charCount = this.value.length;
    document.querySelector('.title-counter').textContent = `${charCount}/100`;
});

editor.addEventListener('input', function() {
    const charCount = this.innerText.length;
    document.querySelector('.content-counter').textContent = `${charCount}/10000`;
    
    if (charCount > 10000) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        range.deleteContents();
    }
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadPosts();
});
