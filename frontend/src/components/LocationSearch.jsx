import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

const LocationSearch = ({
  placeholder,
  iconColor = 'text-slate-400',
  onSelect,
  defaultValue = '',
}) => {
  const [query, setQuery] = useState(defaultValue || '');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(defaultValue || '');
  }, [defaultValue]);

  useEffect(() => {
    const closeDropdown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeDropdown);
    return () => document.removeEventListener('mousedown', closeDropdown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const searchLocation = async () => {
      const trimmedQuery = query.trim();

      if (trimmedQuery.length < 2 || trimmedQuery === (defaultValue || '').trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            trimmedQuery
          )}&format=json&addressdetails=1&limit=5&countrycodes=in`,
          {
            headers: {
              'Accept-Language': 'en',
            },
            signal: controller.signal,
          }
        );

        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setIsOpen(true);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Location search error:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchLocation, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, defaultValue]);

  const handleSelect = (place) => {
    const lng = Number(place.lon);
    const selectedPlace = {
      name: place.display_name,
      lat: Number(place.lat),
      lng,
      // Backward-compatible keys for older callers.
      display_name: place.display_name,
      lon: lng,
      raw: place,
    };

    setQuery(selectedPlace.name);
    setResults([]);
    setIsOpen(false);
    onSelect?.(selectedPlace);
  };

  return (
    <div className="relative flex-1 flex items-center w-full" ref={wrapperRef}>
      <MapPin className={`w-5 h-5 ${iconColor} mr-3 flex-shrink-0`} />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="w-full text-slate-900 placeholder:text-slate-400 focus:outline-none text-lg bg-transparent"
      />

      {loading && (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-2" />
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50">
          {results.map((place) => (
            <button
              type="button"
              key={place.place_id}
              onClick={() => handleSelect(place)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer text-slate-700 text-sm border-b last:border-0 border-slate-50"
              title={place.display_name}
            >
              {place.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
