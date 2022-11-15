import React, { useEffect } from 'react';
import {
  Header,
  Loader,
  Icon,
  Segment,
  Tab
} from 'semantic-ui-react';
import { Navigate } from 'react-router';

import HSBreadcrumb from '@src/Parts/HSBreadcrumb';
import GeneralForm from '@containers/Components/Hosting/Pages/Parts/GeneralForm';
import Zone from './Zone';

import '@sass/Hosting.scss';

const General = (props) => {

  const { domains, controlFormInput, currentDomain, inputs } = props;

  
  const handleEdit = (e, data) => {
    const { target: input } = e;
  
    if(input.dataset.hasOwnProperty('id')) {
      controlFormInput('generalForm', {
        ...inputs.generalForm,
        [input.dataset.id]: {
          ...inputs.generalForm[input.dataset.id],
          [input.name]: input.value 
        }
      });
    } else {
      controlFormInput('generalForm', {
        ...inputs.generalForm,
        [e.target.name]: e.target.value
      });
    }
  
    if(data !== undefined) {
      controlFormInput('generalForm', {
        ...inputs.generalForm,
        [data["data-id"]]: {
          ...inputs.generalForm[data["data-id"]],
          [data.name]: + data.checked ? data.checked : data.value
        }
      });
    }
  }
  
  const handleSubmit = () => {
    console.log(inputs.generalForm);
    controlFormInput('zone', undefined);
  }

  if(domains, currentDomain === null || undefined) {
    return <Navigate to="/hosting" />
  }

  const panes = [
    {
      menuItem: 'General informations',
      render: () => <Tab.Pane attached={false} inverted>
        <GeneralForm
          currentDomain={currentDomain}
          controlFormInput={controlFormInput}
          handleEdit={handleEdit}
          handleSubmit={handleSubmit}
        />
      </Tab.Pane>,
    },
    {
      menuItem: 'Domain zone',
      render: () => <Tab.Pane attached={false} inverted>
        <Zone
          currentDomain={currentDomain}
          handleEdit={handleEdit}
          handleSubmit={handleSubmit}
        />
      </Tab.Pane>
    }
  ];

  return (
    <main>
        <HSBreadcrumb />
        <Header as={Segment} icon inverted className='host-header'>
          <Icon name="edit" />
          Website edition
        </Header>
        {currentDomain !== null &&
          <Tab
            menu={{ secondary: true, inverted: true }}
            panes={panes}
          />
        ||
        <Loader active />
      }
    </main>
    )
}

export default General;
