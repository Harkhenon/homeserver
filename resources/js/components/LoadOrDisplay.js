import React from 'react'
import { Loader } from 'semantic-ui-react'

const LoadOrDisplay = ({data, element}) => (
  !data ? <Loader /> : element
)

export default LoadOrDisplay;
