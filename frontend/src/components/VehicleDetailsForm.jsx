const VehicleDetailsForm = ({
  value,
  onChange,
  onSave,
  onDelete,
  saving = false,
  deleting = false,
}) => {
  const vehicle = value || {
    type: '',
    brand: '',
    model: '',
    number: '',
    seats: '',
    image: '',
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={vehicle.type || ''}
          onChange={(event) => onChange?.({ ...vehicle, type: event.target.value })}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Vehicle type</option>
          <option value="car">Car</option>
          <option value="bike">Bike</option>
          <option value="van">Van</option>
          <option value="auto">Auto</option>
        </select>
        <input
          value={vehicle.brand || ''}
          onChange={(event) => onChange?.({ ...vehicle, brand: event.target.value })}
          placeholder="Brand"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={vehicle.model || ''}
          onChange={(event) => onChange?.({ ...vehicle, model: event.target.value })}
          placeholder="Model"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={vehicle.number || ''}
          onChange={(event) =>
            onChange?.({ ...vehicle, number: event.target.value.toUpperCase() })
          }
          placeholder="Vehicle number"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase"
        />
        <input
          type="number"
          min={1}
          max={12}
          value={vehicle.seats ?? ''}
          onChange={(event) => onChange?.({ ...vehicle, seats: event.target.value })}
          placeholder="Seats"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={vehicle.image || ''}
          onChange={(event) => onChange?.({ ...vehicle, image: event.target.value })}
          placeholder="Vehicle image URL (optional)"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || deleting}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Vehicle'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={saving || deleting}
          className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-60"
        >
          {deleting ? 'Removing...' : 'Delete Vehicle'}
        </button>
      </div>
    </div>
  );
};

export default VehicleDetailsForm;
