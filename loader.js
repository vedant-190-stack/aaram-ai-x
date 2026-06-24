// loader.js
async function detectLocationAndProceed() {
  const status = document.getElementById('status');
  
  try {
    // Attempt to get location with a 4-second timeout
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
    });
    
    sessionStorage.setItem('lat', pos.coords.latitude);
    sessionStorage.setItem('lon', pos.coords.longitude);
    sessionStorage.setItem('geoDetected', 'true');
    if(status) status.textContent = "Location synchronized!";
  } catch (e) {
    sessionStorage.setItem('geoDetected', 'false');
    if(status) status.textContent = "Using default farm profile...";
  }

  // Redirect to your main dashboard
  window.location.href = "aarambh-ai-x.html";
}

// Run this as soon as the file loads
detectLocationAndProceed();
