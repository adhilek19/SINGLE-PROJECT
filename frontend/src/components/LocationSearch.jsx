import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { fetchGeoapifyLocations } from '../services/locationAutocomplete';

const MIN_SEARCH_LENGTH = 2;

const LocationSearch = ({
  label,
  placeholder,
  iconColor = 'text-slate-400',
  onSelect,
  defaultValue = '',
  value,
  onChange,
  disabled = false,
  closeSignal = 0,
  onOpen,
  isActive,
  onActivate,
  onCloseAll,
}) => {
  const initialValue =
    (typeof value === 'string' ? value : value?.name || value?.label || '') ||
    defaultValue ||
    '';
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);
  const [lastSelectedValue, setLastSelectedValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const fieldIsActive = typeof isActive === 'boolean' ? isActive : true;
  const selectionLocked = hasSelectedLocation && query.trim() === lastSelectedValue;

  useEffect(() => {
    const nextValue =
      (typeof value === 'string' ? value : value?.name || value?.label || '') ||
      defaultValue ||
      '';
    setQuery(nextValue);
    if (value && typeof value === 'object' && (value.lat !== undefined || value.lng !== undefined)) {
      setHasSelectedLocation(true);
      setLastSelectedValue(nextValue.trim());
    } else if (nextValue.trim()) {
      setHasSelectedLocation(false);
    } else if (!nextValue.trim()) {
      setHasSelectedLocation(false);
      setLastSelectedValue('');
    }
  }, [defaultValue, value]);

  useEffect(() => {
    setIsOpen(false);
    setNoResults(false);
    setSuggestions([]);
  }, [closeSignal]);

  useEffect(() => {
    if (!fieldIsActive) {
      setIsOpen(false);
      setSuggestions([]);
    }
  }, [fieldIsActive]);

  useEffect(() => {
    const closeDropdown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsFocused(false);
        setIsOpen(false);
        setSuggestions([]);
        onCloseAll?.();
      }
    };

    document.addEventListener('mousedown', closeDropdown);
    return () => document.removeEventListener('mousedown', closeDropdown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const searchLocation = async () => {
      const trimmedQuery = query.trim();

      if (
        !fieldIsActive ||
        disabled ||
        trimmedQuery.length < MIN_SEARCH_LENGTH ||
        (hasSelectedLocation && trimmedQuery === lastSelectedValue)
      ) {
        setSuggestions([]);
        setIsOpen(false);
        setNoResults(false);
        return;
      }

      setLoading(true);

      try {
        const data = await fetchGeoapifyLocations(trimmedQuery, controller.signal);
        setSuggestions(data);
        setNoResults(trimmedQuery.length >= MIN_SEARCH_LENGTH && data.length === 0);
        setIsOpen(fieldIsActive && trimmedQuery.length >= MIN_SEARCH_LENGTH);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setSuggestions([]);
          setNoResults(false);
          setIsOpen(false);
        }
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchLocation, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, fieldIsActive, disabled, hasSelectedLocation, lastSelectedValue]);

  const handleSelect = (place) => {
    const selectedPlace = {
      ...place,
      name: place.name || place.label,
    };

    const selectedText = selectedPlace.label || selectedPlace.name || '';
    setQuery(selectedText);
    setSuggestions([]);
    setNoResults(false);
    setIsOpen(false);
    setHasSelectedLocation(true);
    setLastSelectedValue(selectedText.trim());
    onChange?.(selectedPlace);
    onSelect?.(selectedPlace);
    setIsFocused(false);
    inputRef.current?.blur();
    onCloseAll?.();
  };

  return (
    <div
      className="relative w-full"
      ref={wrapperRef}
      onMouseDown={() => {
        if (!disabled) {
          onActivate?.();
          onOpen?.();
        }
      }}
    >
      {label ? (
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          {label}
        </label>
      ) : null}

      <div className="relative flex-1 flex items-center w-full rounded-xl border border-slate-300 px-4 py-3 bg-white">
        <MapPin className={`w-5 h-5 ${iconColor} mr-3 flex-shrink-0`} />

        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            const valueText = e.target.value;
            const trimmedValue = valueText.trim();
            const isManualEdit = trimmedValue !== lastSelectedValue;

            setQuery(valueText);
            onActivate?.();

            if (!trimmedValue) {
              setSuggestions([]);
              setIsOpen(false);
              setNoResults(false);
              setHasSelectedLocation(false);
              setLastSelectedValue('');
              onChange?.('');
              return;
            }

            if (isManualEdit) {
              setHasSelectedLocation(false);
              setNoResults(false);
              onChange?.(valueText);
              if (!disabled && trimmedValue.length >= MIN_SEARCH_LENGTH) {
                setIsOpen(true);
              }
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            onActivate?.();
            onOpen?.();
            if (selectionLocked) return;
            if (!disabled && query.trim().length >= MIN_SEARCH_LENGTH) {
              setIsOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsFocused(false);
              setIsOpen(false);
              setSuggestions([]);
              onCloseAll?.();
            }
          }}
          placeholder={placeholder}
          className="w-full text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
        />

        {loading && (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-2" />
        )}
      </div>

      {isOpen && fieldIsActive && !selectionLocked && (
        <div className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-100 z-50 md:max-h-72">
          {suggestions.map((place) => (
            <button
              type="button"
              key={`${place.lat}-${place.lng}-${place.label}`}
              onClick={() => handleSelect(place)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer text-slate-700 text-sm border-b last:border-0 border-slate-50"
              title={place.label}
            >
              {place.label}
            </button>
          ))}
          {!loading && noResults ? (
            <div className="px-4 py-3 text-sm text-slate-500">No locations found</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
