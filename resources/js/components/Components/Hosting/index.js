import React from 'react'
import '../scss/Hosting.scss';

function Hosting() {
  return (
    <main className='container'>
      <h2 id='title'>Hosting manager</h2>
      <h3>Host types</h3>
      <button className='btn green'>Create host</button>
      <div className="row">
        <div className='col s4 m4 l4 xl4'>
          <div className='card blue-grey darken-4'>
            <div className='card-content'>
              <span className='card-title'>isodev.ovh</span>
              <p>This is a test</p>
              <button className="btn-floating halfway-fab halfway-fab-padded waves-effect waves-light red">
                <i className="material-icons">delete</i>
              </button>
              <button className="btn-floating halfway-fab waves-effect waves-light orange">
                <i className="material-icons">edit</i>
              </button>
            </div>
          </div>
        </div>
        <div className='col s4 m4 l4 xl4'>
        <div className='card blue-grey darken-4'>
          <div className='card-content'>
            <span className='card-title'>isoweb.ovh</span>
            <p>This is a test</p>
            <button className="btn-floating halfway-fab halfway-fab-padded waves-effect waves-light red">
              <i className="material-icons">delete</i>
            </button>
            <button className="btn-floating halfway-fab waves-effect waves-light orange">
              <i className="material-icons">edit</i>
            </button>
          </div>
        </div>
      </div>
      <div className='col s4 m4 l4 xl4'>
      <div className='card blue-grey darken-4'>
        <div className='card-content'>
          <span className='card-title'>isoweb.eu</span>
          <p>This is a test</p>
          <button className="btn-floating halfway-fab halfway-fab-padded waves-effect waves-light red">
            <i className="material-icons">delete</i>
          </button>
          <button className="btn-floating halfway-fab waves-effect waves-light orange">
            <i className="material-icons">edit</i>
          </button>
        </div>
      </div>
    </div>
      </div>
    </main>
  )
}

export default Hosting