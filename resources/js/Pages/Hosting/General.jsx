import React, { useEffect, useState } from 'react';
import {
  Header,
  Loader,
  Icon,
  Segment,
  Tab
} from 'semantic-ui-react';

import GeneralForm from '@pages/Hosting/Pages/Parts/GeneralForm';
import Zone from '@pages/Hosting/Pages/Zone';

import '@sass/Hosting.scss';

const General = (props) => {

  const { 
    domains, 
    currentDomain, 
    setCurrentDomain, 
    getDomains,
    setDomains
  } = props;
  const [ inputs, setInputs ] = useState(0)
   
  const handleEdit = (e, element) => {
    const { target } = e;

    function inputArray(input) {
      let names = []
      let result = []
      if(input.name.split(':').length > 1) {
        names = input.name.split(':')
        result[names[0]] = {
          ...inputs[names[0]],
          [names[1]]: input.type !== "checkbox" ? input.value : input.checked
        }
      } else {
        result[input.name] = input.type !== "checkbox" ? input.value : input.checked
      }


      return result === false ? "Shit" : result
    }

    let currentInput = element === undefined ? inputArray(target) : inputArray(element);
    let mergedInputs = {
      ...inputs,
      ...currentInput
    };

    setInputs(mergedInputs);
    console.log(mergedInputs)

  }


  if(domains, currentDomain === null || undefined) {
    return <Navigate to="/hosting" />
  }

  if (inputs === 0 && currentDomain !== null) {
    let hostParams = JSON.parse(currentDomain.host)
    let zoneParams = JSON.parse(currentDomain.zone)

    // setInputs({
    //   ...inputs,
    //   ...currentDomain,
    //   host: hostParams,
    //   zone: zoneParams
    // })
  }

  const panes = [
    {
      menuItem: 'General informations',
      render: () => <Tab.Pane attached={false} inverted>
        <GeneralForm
          currentDomain={currentDomain}
          handleEdit={handleEdit}
          inputs={inputs}
          setInputs={setInputs}
          getDomains={getDomains}
          setDomains={setDomains}
        />
      </Tab.Pane>,
    },
    {
      menuItem: 'Domain zone',
      render: () => <Tab.Pane attached={false} inverted>
        <Zone
          currentDomain={currentDomain}
          domains={domains}
          handleEdit={handleEdit}
          inputs={inputs}
          setInputs={setInputs}
          getDomains={getDomains}
          setCurrentDomain={setCurrentDomain}
        />
      </Tab.Pane>
    }
  ];

  return (
    <main>
        <Header as={Segment} icon inverted className='host-header'>
          <Icon name="edit" />
          Website edition
        </Header>
        {currentDomain !== null &&
          <Tab
            menu={{ secondary: true, inverted: false }}
            panes={panes}
          />
        ||
        <Loader active />
      }
    </main>
    )
}

export default General;
