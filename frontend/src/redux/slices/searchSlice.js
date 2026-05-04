const initialState = {
  from: '',
  to: '',
  date: '',
};

export const searchReducer = (state = initialState, action) => {
  switch (action.type) {
    case 'search/setSearch':
      return {
        ...state,
        ...action.payload,
      };

    case 'search/clearSearch':
      return initialState;

    default:
      return state;
  }
};