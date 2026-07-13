const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

async function request(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const api = {
  species: (q) => request(`/species${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  speciesById: (id) => request(`/species/${id}`),
  spots: () => request('/spots'),
  regulations: () => request('/regulations'),
  marine: (lat, lng) => request(`/marine?lat=${lat}&lng=${lng}`),
  identify: (q, sizeCm) => {
    let url = `/identify?q=${encodeURIComponent(q)}`;
    if (sizeCm) url += `&sizeCm=${sizeCm}`;
    return request(url);
  },
};