class PlantTracker {
    constructor() {
        this.stream = null;
        this.db = null;
        this.initializeApp();
        this.deferredPrompt = null; 
    }

    async initializeApp() {
        await this.registerServiceWorker();
        await this.initializeDB();
        this.setupEventListeners();
        this.checkOnlineStatus();
        this.loadPlants();
        this.checkCameraSupport();
        this.setupInstallButton();
    }

    setupInstallButton() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const installButton = document.getElementById('install-button');
            installButton.classList.remove('hidden');
        });

        document.getElementById('install-button').addEventListener('click', async () => {
            const installButton = document.getElementById('install-button');
            
            if (!this.deferredPrompt) {
                return;
            }

            this.deferredPrompt.prompt();

            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`User response to install prompt: ${outcome}`);

            this.deferredPrompt = null;
            
            installButton.classList.add('hidden');
        });

        window.addEventListener('appinstalled', () => {
            document.getElementById('install-button').classList.add('hidden');
            
            const notification = document.createElement('div');
            notification.className = 'notification success';
            notification.textContent = 'App successfully installed!';
            document.querySelector('.container').insertBefore(notification, document.querySelector('.container').firstChild);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);

            console.log('Plant Tracker was successfully installed');
        });
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                
                if (registration.installing) {
                    console.log('Service worker installing');
                    
                    await new Promise((resolve) => {
                        registration.installing.addEventListener('statechange', (e) => {
                            if (e.target.state === 'activated') {
                                resolve();
                            }
                        });
                    });
                }
                
                if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    
                    if (permission === 'granted' && 'PushManager' in window) {
                        try {
                            const subscription = await registration.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: urlBase64ToUint8Array('BILhUrxvQHWUoYMfgDG1ie62Ht41CFY2HluuEzVv1J1ijI_8Zw7kYKUwnmoGvTXBXElct_bCKJ8T0zcTJDlmSk4')
                            });
                            console.log('Push notification subscription successful:', subscription);
                        } catch (pushError) {
                            console.log('Push subscription failed:', pushError);
                        }
                    }
                }
                
                console.log('Service Worker registered successfully');
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    async initializeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PlantTrackerDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('plants')) {
                    db.createObjectStore('plants', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    setupEventListeners() {
        document.getElementById('start-camera').addEventListener('click', () => this.startCamera());
        document.getElementById('take-photo').addEventListener('click', () => this.takePhoto());
        
        document.getElementById('save-plant').addEventListener('click', () => this.savePlant());

        window.addEventListener('online', () => this.checkOnlineStatus());
        window.addEventListener('offline', () => this.checkOnlineStatus());
    }

    checkOnlineStatus() {
        const offlineNotification = document.getElementById('offline-notification');
        if (navigator.onLine) {
            offlineNotification.classList.add('hidden');
            this.syncPlants();
        } else {
            offlineNotification.classList.remove('hidden');
        }
    }

    async checkCameraSupport() {
        const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        document.getElementById('camera-fallback').classList.toggle('hidden', hasCamera);
        document.getElementById('start-camera').classList.toggle('hidden', !hasCamera);
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoElement = document.getElementById('camera-preview');
            videoElement.srcObject = this.stream;
            videoElement.classList.remove('hidden');
            document.getElementById('start-camera').classList.add('hidden');
            document.getElementById('take-photo').classList.remove('hidden');
        } catch (error) {
            console.error('Error accessing camera:', error);
            document.getElementById('camera-fallback').classList.remove('hidden');
        }
    }

    takePhoto() {
        const video = document.getElementById('camera-preview');
        const canvas = document.getElementById('photo-canvas');
        const context = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        
        canvas.classList.remove('hidden');
        document.getElementById('plant-form').classList.remove('hidden');
    }

    async savePlant() {
        const name = document.getElementById('plant-name').value;
        const species = document.getElementById('plant-species').value;
        const canvas = document.getElementById('photo-canvas');
        
        const plant = {
            name,
            species,
            photo: canvas.toDataURL('image/jpeg'),
            timestamp: new Date().toISOString(),
            synced: false
        };

        await this.savePlantToIndexedDB(plant);

        if (navigator.onLine) {
            await this.syncPlants();
        } else if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-plants'); // background sync
        }

        this.resetForm();
        this.loadPlants();
    }

    async savePlantToIndexedDB(plant) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['plants'], 'readwrite');
            const store = transaction.objectStore('plants');
            const request = store.add(plant);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadPlants() {
        const transaction = this.db.transaction(['plants'], 'readonly');
        const store = transaction.objectStore('plants');
        const request = store.getAll();

        request.onsuccess = () => {
            const plants = request.result;
            this.displayPlants(plants);
        };
    }

    displayPlants(plants) {
        const container = document.getElementById('plants-container');
        container.innerHTML = '';

        plants.forEach(plant => {
            const plantElement = document.createElement('div');
            plantElement.className = 'plant-card';
            plantElement.innerHTML = `
                <img src="${plant.photo}" alt="${plant.name}">
                <h3>${plant.name}</h3>
                <p>${plant.species}</p>
            `;
            container.appendChild(plantElement);
        });
    }

    async syncPlants() {
        const transaction = this.db.transaction(['plants'], 'readonly');
        const store = transaction.objectStore('plants');
        const request = store.getAll();

        request.onsuccess = async () => {
            const unsyncedPlants = request.result.filter(plant => !plant.synced);
            
            for (const plant of unsyncedPlants) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const updateTransaction = this.db.transaction(['plants'], 'readwrite');
                    const updateStore = updateTransaction.objectStore('plants');
                    plant.synced = true;
                    updateStore.put(plant);
                    
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('Plant Tracker', {
                            body: `${plant.name} has been synced!`,
                            icon: '/icon-192x192.png'
                        });
                    }
                } catch (error) {
                    console.error('Error syncing plant:', error);
                }
            }
        };
    }

    resetForm() {
        document.getElementById('plant-name').value = '';
        document.getElementById('plant-species').value = '';
        document.getElementById('photo-canvas').classList.add('hidden');
        document.getElementById('plant-form').classList.add('hidden');
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        document.getElementById('camera-preview').classList.add('hidden');
        document.getElementById('start-camera').classList.remove('hidden');
        document.getElementById('take-photo').classList.add('hidden');
    }

    
}

document.addEventListener('DOMContentLoaded', () => {
    new PlantTracker();
});